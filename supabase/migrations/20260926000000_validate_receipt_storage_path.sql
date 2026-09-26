-- Migration: validate_receipt_storage_path
-- NOT YET APPLIED — prepared for independent review (DATABASE_AGENT,
-- REVIEW_AGENT) ahead of an explicit go/no-go decision. This file is the
-- exact SQL to run, once approved. NEVER edit an applied migration; add a
-- new one for any future change.
--
-- Follow-up hardening recommended by the receipt-storage review
-- (20260925120000_add_receipt_storage.sql, applied): create_expense/
-- update_expense currently only check that p_receipt_storage_path starts
-- with 'relationships/<relationship_id>/'. That accepts a path to a file
-- that doesn't exist, a file someone else uploaded, a malformed filename,
-- or a receipt already attached to another expense (double claim). This
-- migration makes every write of expenses.receipt_storage_path require:
--   1. the strict path shape (same regex as the storage.objects policies):
--      relationships/<relationship_id>/<random_uuid>.<jpg|jpeg|png|webp|pdf>
--   2. the <relationship_id> segment equals the expense's own
--      relationship_id (the existing prefix check, restated exactly)
--   3. the object actually exists in storage.objects, bucket 'receipts'
--   4. owner_id = auth.uid()::text — the caller uploaded it
--   5. no OTHER expense already references the same path
--
-- Mechanism: a BEFORE INSERT OR UPDATE OF receipt_storage_path trigger on
-- public.expenses, rather than CREATE OR REPLACE of both RPCs. Why:
-- - Purely additive: the existing ~150-line create_expense/update_expense
--   bodies (applied live) are not re-declared, so there is zero risk of
--   this migration silently reverting or drifting from their live logic.
-- - Covers both RPCs identically, plus any future write path, from one
--   place. Their existing prefix check still runs first, unchanged.
-- - Errors raised here propagate out of the calling RPC exactly like the
--   RPC's own `raise exception '<code>'`, so the app's error mapping is
--   the same mechanism.
-- The trigger only validates when the path actually CHANGES
-- (update_expense always writes the column, even when unchanged); an
-- unchanged path was already validated when it was set, and NULL (no
-- receipt / receipt removed) is always allowed.
--
-- Also adds a UNIQUE partial index on expenses(receipt_storage_path):
-- the race-proof backstop for check 5, and the index the storage.objects
-- receipts_select / receipts_delete policy subqueries
-- (`e.receipt_storage_path = storage.objects.name`) were missing.
--
-- Pre-apply read-only checks (run first; expected results in brackets):
--   -- no duplicate paths that would block the unique index    [0 rows]
--   select receipt_storage_path, count(*) from public.expenses
--    where receipt_storage_path is not null
--    group by 1 having count(*) > 1;
--   -- existing non-null paths (app has only ever sent null)   [0]
--   -- MANDATORY: paths set before this migration are never re-validated
--   select count(*) from public.expenses where receipt_storage_path is not null;
--   -- index name not already taken (IF NOT EXISTS would silently skip) [0 rows]
--   select indexdef from pg_indexes where indexname = 'expenses_receipt_storage_path_key';
--   -- run AS THE MIGRATION ROLE: the SECURITY DEFINER trigger reads
--   -- storage.objects, which is owned by supabase_storage_admin, so owner
--   -- bypass does not apply and every receipts policy is `to authenticated`.
--   -- The owner (postgres) therefore needs SELECT + BYPASSRLS, else every
--   -- attach fails closed with receipt_not_found (safe, but broken).
--   select current_user, rolbypassrls from pg_roles where rolname = current_user; [postgres | true]
--   select has_table_privilege('storage.objects', 'select');                     [true]
--
-- Operational note: any write of a NON-null path without a user JWT (SQL
-- editor, maintenance job) now raises not_authenticated. Data repair must
-- set the path to NULL, not to another path. Fails closed by design.
--
-- NOT changed: storage bucket, storage.objects policies (not weakened or
-- touched), RPC signatures/grants/bodies, expenses RLS. No service_role.

begin;

-- ============================================================
-- 1. Validation trigger function
-- SECURITY DEFINER so it can read storage.objects regardless of the
-- caller's storage RLS (the check must see the object even though the
-- caller's own SELECT policy would also allow it — it must not DEPEND on
-- that). search_path = '' with fully-qualified names, matching every
-- other function in this schema. auth.uid() still resolves to the
-- calling user (it reads the request's JWT claims, not current_user).
-- ============================================================
create or replace function public._validate_expense_receipt_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text := new.receipt_storage_path;
  v_uid uuid := auth.uid();
begin
  if v_path is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and v_path is not distinct from old.receipt_storage_path then
    return new;
  end if;

  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_path !~ '^relationships/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$'
     or split_part(v_path, '/', 2) <> new.relationship_id::text then
    raise exception 'invalid_receipt_storage_path';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'receipts'
      and o.name = v_path
      and o.owner_id = v_uid::text
  ) then
    -- One code for "missing" and "not yours": don't reveal whether some
    -- other user's object exists at that path.
    raise exception 'receipt_not_found';
  end if;

  if exists (
    select 1 from public.expenses e
    where e.receipt_storage_path = v_path
      and e.id <> new.id
  ) then
    raise exception 'receipt_already_attached';
  end if;

  return new;
end;
$$;

-- Internal only: a trigger function is never called directly; no role
-- gets EXECUTE (firing a trigger does not check EXECUTE).
revoke all on function public._validate_expense_receipt_path() from public, anon, authenticated;

drop trigger if exists validate_expense_receipt_path on public.expenses;
create trigger validate_expense_receipt_path
  before insert or update of receipt_storage_path on public.expenses
  for each row execute function public._validate_expense_receipt_path();

-- ============================================================
-- 2. One expense per receipt object (backstop for the check above under
-- concurrency) + index for the storage.objects policy subqueries.
-- ============================================================
create unique index if not exists expenses_receipt_storage_path_key
  on public.expenses (receipt_storage_path)
  where receipt_storage_path is not null;

commit;
