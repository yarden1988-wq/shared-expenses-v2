-- Migration: expenses_epic_foundation
-- NOT YET APPLIED — prepared and statically reviewed (DATABASE_AGENT,
-- REVIEW_AGENT) ahead of an explicit go/no-go decision. This file is the
-- exact SQL to run, once approved. NEVER edit an applied migration; add a
-- new one for any future change.
--
-- Adds the Fast Beta expense + approval workflow. Additive only — creates
-- 5 new tables and 7 new functions; touches no existing table, row, or
-- grant. RLS is enabled in the same statement block as each CREATE TABLE,
-- before any grants, so there is no window where a new table exists
-- unprotected.
--
-- Design notes (deliberate simplifications vs. the old reference project,
-- since nothing here exists live yet):
-- - receipts + expenses merged into one `expenses` table with a status
--   column doing both jobs.
-- - Child assignment is expense-level (`expense_children`), not per line
--   item.
-- - No separate expense_allocations table: each expense has exactly one
--   directional debt, stored directly on the expense row.
-- - No payments table this epic (settlement is explicitly deferred).
-- - balances is one cumulative net row per relationship, no period_month
--   — this removes the period-scoping bug found in the old design by
--   removing the second scope it could drift against, rather than patching
--   it.
-- - expense_categories is a global list with a real UNIQUE(name), fixing
--   the old project's non-idempotent seed.
-- - expense_items.is_approved is nullable and unused by the binary
--   approve/reject path — present only so a future partial-approval-only
--   RPC needs no schema change.

begin;

-- ============================================================
-- 1. expense_categories
-- ============================================================
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint expense_categories_name_key unique (name)
);

alter table public.expense_categories enable row level security;

drop policy if exists "expense_categories_select" on public.expense_categories;
create policy "expense_categories_select"
  on public.expense_categories
  for select
  to authenticated
  using (true);

insert into public.expense_categories (name, sort_order) values
  ('חינוך', 1),
  ('בריאות', 2),
  ('ביגוד', 3),
  ('פעילויות', 4),
  ('מזון', 5),
  ('אחר', 6)
on conflict (name) do nothing;

-- ============================================================
-- 2. expenses
-- ============================================================
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id),
  created_by uuid not null references auth.users (id),
  category_id uuid not null references public.expense_categories (id),
  merchant_name text not null check (length(trim(merchant_name)) > 0),
  expense_date date not null check (expense_date <= current_date),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'partially_approved', 'rejected', 'changes_requested')),
  status_reason text,
  parent_one_percentage int not null check (parent_one_percentage between 0 and 100),
  parent_two_percentage int not null check (parent_two_percentage between 0 and 100),
  constraint expenses_percentages_sum_100 check (parent_one_percentage + parent_two_percentage = 100),
  eligible_amount numeric(10,2) not null default 0 check (eligible_amount >= 0),
  owed_amount numeric(10,2) check (owed_amount >= 0),
  owed_by_user_id uuid references auth.users (id),
  owed_to_user_id uuid references auth.users (id),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_relationship_id_idx on public.expenses (relationship_id);
create index if not exists expenses_created_by_idx on public.expenses (created_by);
create index if not exists expenses_status_idx on public.expenses (status);

alter table public.expenses enable row level security;

-- Drafts are private to their creator at the RLS level, not just in app
-- logic: both participants pass is_relationship_participant, but a draft
-- additionally requires being its own creator to be visible.
drop policy if exists "expenses_select" on public.expenses;
create policy "expenses_select"
  on public.expenses
  for select
  to authenticated
  using (
    public.is_relationship_participant(relationship_id)
    and (status <> 'draft' or created_by = auth.uid())
  );

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ============================================================
-- 3. expense_items
-- ============================================================
create table if not exists public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses (id) on delete cascade,
  description text not null check (length(trim(description)) > 0),
  amount numeric(10,2) not null check (amount > 0),
  is_selected boolean not null default true,
  is_approved boolean,
  created_at timestamptz not null default now()
);

create index if not exists expense_items_expense_id_idx on public.expense_items (expense_id);

alter table public.expense_items enable row level security;

drop policy if exists "expense_items_select" on public.expense_items;
create policy "expense_items_select"
  on public.expense_items
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_items.expense_id
        and public.is_relationship_participant(e.relationship_id)
        and (e.status <> 'draft' or e.created_by = auth.uid())
    )
  );

-- ============================================================
-- 4. expense_children
-- ============================================================
create table if not exists public.expense_children (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  child_id uuid not null references public.children (id),
  primary key (expense_id, child_id)
);

create index if not exists expense_children_child_id_idx on public.expense_children (child_id);

alter table public.expense_children enable row level security;

drop policy if exists "expense_children_select" on public.expense_children;
create policy "expense_children_select"
  on public.expense_children
  for select
  to authenticated
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_children.expense_id
        and public.is_relationship_participant(e.relationship_id)
        and (e.status <> 'draft' or e.created_by = auth.uid())
    )
  );

-- ============================================================
-- 5. balances (one cumulative net row per relationship)
-- net_amount convention: positive => the 'parent_two' member owes the
-- 'parent_one' member; negative => parent_one owes parent_two.
-- ============================================================
create table if not exists public.balances (
  relationship_id uuid primary key references public.relationships (id),
  net_amount numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.balances enable row level security;

drop policy if exists "balances_select" on public.balances;
create policy "balances_select"
  on public.balances
  for select
  to authenticated
  using (public.is_relationship_participant(relationship_id));

-- ============================================================
-- 6. Functions
-- ============================================================

-- Internal only — recomputes the balance fresh from approved expenses
-- every time (idempotent, retry-safe). No EXECUTE grant to any role;
-- only ever called via `perform` from approve_expense.
create or replace function public._recalculate_balance(p_relationship_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_one_id uuid;
  v_parent_two_id uuid;
  v_net numeric(10,2);
begin
  select user_id into v_parent_one_id
  from public.relationship_members
  where relationship_id = p_relationship_id and member_position = 'parent_one';

  select user_id into v_parent_two_id
  from public.relationship_members
  where relationship_id = p_relationship_id and member_position = 'parent_two';

  if v_parent_one_id is null or v_parent_two_id is null then
    return;
  end if;

  select coalesce(sum(
    case
      when owed_by_user_id = v_parent_two_id then owed_amount
      when owed_by_user_id = v_parent_one_id then -owed_amount
      else 0
    end
  ), 0)
  into v_net
  from public.expenses
  where relationship_id = p_relationship_id
    and status in ('approved', 'partially_approved');

  insert into public.balances (relationship_id, net_amount, updated_at)
  values (p_relationship_id, v_net, now())
  on conflict (relationship_id) do update
    set net_amount = excluded.net_amount,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.create_expense(
  p_relationship_id uuid,
  p_category_id uuid,
  p_merchant_name text,
  p_expense_date date,
  p_items jsonb,
  p_child_ids uuid[],
  p_parent_one_percentage int default null,
  p_parent_two_percentage int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_relationship public.relationships%rowtype;
  v_revision public.relationship_revisions%rowtype;
  v_expense_id uuid;
  v_item jsonb;
  v_eligible_amount numeric(10,2) := 0;
  v_p1 int;
  v_p2 int;
  v_child_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_relationship_participant(p_relationship_id) then
    raise exception 'not_relationship_participant';
  end if;

  select * into v_relationship from public.relationships where id = p_relationship_id;
  if not found then
    raise exception 'relationship_not_found';
  end if;

  if v_relationship.status <> 'active' then
    raise exception 'relationship_not_active';
  end if;

  if length(trim(coalesce(p_merchant_name, ''))) = 0 then
    raise exception 'invalid_merchant_name';
  end if;

  if p_expense_date is null or p_expense_date > current_date then
    raise exception 'invalid_expense_date';
  end if;

  if not exists (select 1 from public.expense_categories where id = p_category_id) then
    raise exception 'invalid_category';
  end if;

  if p_child_ids is null or array_length(p_child_ids, 1) is null then
    raise exception 'children_required';
  end if;

  if exists (
    select 1 from unnest(p_child_ids) as cid
    where not exists (
      select 1 from public.children c
      where c.id = cid and c.relationship_id = p_relationship_id
    )
  ) then
    raise exception 'invalid_child_reference';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required';
  end if;

  if p_parent_one_percentage is not null or p_parent_two_percentage is not null then
    if p_parent_one_percentage is null or p_parent_two_percentage is null
       or p_parent_one_percentage < 0 or p_parent_two_percentage < 0
       or p_parent_one_percentage + p_parent_two_percentage <> 100 then
      raise exception 'invalid_split_ratio';
    end if;
    v_p1 := p_parent_one_percentage;
    v_p2 := p_parent_two_percentage;
  else
    if v_relationship.active_revision_id is null then
      raise exception 'relationship_missing_active_revision';
    end if;

    select * into v_revision
    from public.relationship_revisions
    where id = v_relationship.active_revision_id;

    if not found then
      raise exception 'relationship_missing_active_revision';
    end if;

    v_p1 := v_revision.parent_one_percentage;
    v_p2 := v_revision.parent_two_percentage;
  end if;

  insert into public.expenses (
    relationship_id, created_by, category_id, merchant_name, expense_date,
    status, parent_one_percentage, parent_two_percentage, eligible_amount
  )
  values (
    p_relationship_id, v_uid, p_category_id, trim(p_merchant_name), p_expense_date,
    'draft', v_p1, v_p2, 0
  )
  returning id into v_expense_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce(trim(v_item ->> 'description'), '') = '' then
      raise exception 'item_description_required';
    end if;
    if (v_item ->> 'amount') is null or (v_item ->> 'amount')::numeric <= 0 then
      raise exception 'item_amount_invalid';
    end if;

    insert into public.expense_items (expense_id, description, amount, is_selected)
    values (
      v_expense_id,
      trim(v_item ->> 'description'),
      (v_item ->> 'amount')::numeric,
      coalesce((v_item ->> 'included')::boolean, true)
    );

    if coalesce((v_item ->> 'included')::boolean, true) then
      v_eligible_amount := v_eligible_amount + (v_item ->> 'amount')::numeric;
    end if;
  end loop;

  foreach v_child_id in array p_child_ids
  loop
    insert into public.expense_children (expense_id, child_id)
    values (v_expense_id, v_child_id)
    on conflict do nothing;
  end loop;

  update public.expenses set eligible_amount = v_eligible_amount where id = v_expense_id;

  insert into public.audit_events (relationship_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (p_relationship_id, v_uid, 'expense_created', 'expense', v_expense_id,
          jsonb_build_object('merchant_name', trim(p_merchant_name)));

  return jsonb_build_object('expense_id', v_expense_id);
end;
$$;

create or replace function public.update_expense(
  p_expense_id uuid,
  p_category_id uuid,
  p_merchant_name text,
  p_expense_date date,
  p_items jsonb,
  p_child_ids uuid[],
  p_parent_one_percentage int default null,
  p_parent_two_percentage int default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_relationship public.relationships%rowtype;
  v_revision public.relationship_revisions%rowtype;
  v_item jsonb;
  v_eligible_amount numeric(10,2) := 0;
  v_p1 int;
  v_p2 int;
  v_child_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'expense_not_found';
  end if;

  if v_expense.created_by <> v_uid then
    raise exception 'not_expense_owner';
  end if;

  if v_expense.status not in ('draft', 'changes_requested') then
    raise exception 'expense_not_editable';
  end if;

  select * into v_relationship from public.relationships where id = v_expense.relationship_id;

  if v_relationship.status <> 'active' then
    raise exception 'relationship_not_active';
  end if;

  if length(trim(coalesce(p_merchant_name, ''))) = 0 then
    raise exception 'invalid_merchant_name';
  end if;

  if p_expense_date is null or p_expense_date > current_date then
    raise exception 'invalid_expense_date';
  end if;

  if not exists (select 1 from public.expense_categories where id = p_category_id) then
    raise exception 'invalid_category';
  end if;

  if p_child_ids is null or array_length(p_child_ids, 1) is null then
    raise exception 'children_required';
  end if;

  if exists (
    select 1 from unnest(p_child_ids) as cid
    where not exists (
      select 1 from public.children c
      where c.id = cid and c.relationship_id = v_expense.relationship_id
    )
  ) then
    raise exception 'invalid_child_reference';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'items_required';
  end if;

  if p_parent_one_percentage is not null or p_parent_two_percentage is not null then
    if p_parent_one_percentage is null or p_parent_two_percentage is null
       or p_parent_one_percentage < 0 or p_parent_two_percentage < 0
       or p_parent_one_percentage + p_parent_two_percentage <> 100 then
      raise exception 'invalid_split_ratio';
    end if;
    v_p1 := p_parent_one_percentage;
    v_p2 := p_parent_two_percentage;
  else
    select * into v_revision
    from public.relationship_revisions
    where id = v_relationship.active_revision_id;

    if not found then
      raise exception 'relationship_missing_active_revision';
    end if;

    v_p1 := v_revision.parent_one_percentage;
    v_p2 := v_revision.parent_two_percentage;
  end if;

  delete from public.expense_items where expense_id = p_expense_id;
  delete from public.expense_children where expense_id = p_expense_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    if coalesce(trim(v_item ->> 'description'), '') = '' then
      raise exception 'item_description_required';
    end if;
    if (v_item ->> 'amount') is null or (v_item ->> 'amount')::numeric <= 0 then
      raise exception 'item_amount_invalid';
    end if;

    insert into public.expense_items (expense_id, description, amount, is_selected)
    values (
      p_expense_id,
      trim(v_item ->> 'description'),
      (v_item ->> 'amount')::numeric,
      coalesce((v_item ->> 'included')::boolean, true)
    );

    if coalesce((v_item ->> 'included')::boolean, true) then
      v_eligible_amount := v_eligible_amount + (v_item ->> 'amount')::numeric;
    end if;
  end loop;

  foreach v_child_id in array p_child_ids
  loop
    insert into public.expense_children (expense_id, child_id)
    values (p_expense_id, v_child_id)
    on conflict do nothing;
  end loop;

  update public.expenses
  set category_id = p_category_id,
      merchant_name = trim(p_merchant_name),
      expense_date = p_expense_date,
      parent_one_percentage = v_p1,
      parent_two_percentage = v_p2,
      eligible_amount = v_eligible_amount,
      status = case when status = 'changes_requested' then 'draft' else status end,
      updated_at = now()
  where id = p_expense_id;

  insert into public.audit_events (relationship_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_expense.relationship_id, v_uid, 'expense_updated', 'expense', p_expense_id, '{}'::jsonb);

  return jsonb_build_object('expense_id', p_expense_id);
end;
$$;

create or replace function public.submit_expense(p_expense_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_expense public.expenses%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'expense_not_found';
  end if;

  if v_expense.created_by <> v_uid then
    raise exception 'not_expense_owner';
  end if;

  if v_expense.status <> 'draft' then
    raise exception 'expense_not_draft';
  end if;

  if v_expense.eligible_amount <= 0 then
    raise exception 'no_items_included';
  end if;

  update public.expenses
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_expense_id;

  insert into public.audit_events (relationship_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_expense.relationship_id, v_uid, 'expense_submitted', 'expense', p_expense_id, '{}'::jsonb);

  return jsonb_build_object('expense_id', p_expense_id, 'status', 'submitted');
end;
$$;

create or replace function public.approve_expense(
  p_expense_id uuid,
  p_excluded_item_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_other_user_id uuid;
  v_other_position text;
  v_eligible_amount numeric(10,2);
  v_owed_amount numeric(10,2);
  v_status text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'expense_not_found';
  end if;

  -- Membership is checked before status/self-ownership so a non-participant
  -- (even one holding a valid expense id) never learns anything about this
  -- expense's status or creator before being rejected.
  if not exists (
    select 1 from public.relationship_members
    where relationship_id = v_expense.relationship_id and user_id = v_uid
  ) then
    raise exception 'not_relationship_member';
  end if;

  -- Self-approval is impossible regardless of what the client sends:
  -- identity comes only from auth.uid(), never a parameter.
  if v_expense.created_by = v_uid then
    raise exception 'cannot_approve_own_expense';
  end if;

  if v_expense.status <> 'submitted' then
    raise exception 'expense_not_submitted';
  end if;

  if p_excluded_item_ids is not null and array_length(p_excluded_item_ids, 1) is not null then
    if exists (
      select 1 from unnest(p_excluded_item_ids) as iid
      where not exists (select 1 from public.expense_items where id = iid and expense_id = p_expense_id)
    ) then
      raise exception 'invalid_item_reference';
    end if;
  end if;

  update public.expense_items
  set is_approved = is_selected and not (id = any(coalesce(p_excluded_item_ids, '{}')))
  where expense_id = p_expense_id;

  select coalesce(sum(amount), 0) into v_eligible_amount
  from public.expense_items
  where expense_id = p_expense_id and is_approved = true;

  if v_eligible_amount <= 0 then
    raise exception 'no_items_approved';
  end if;

  v_status := case
    when p_excluded_item_ids is not null and array_length(p_excluded_item_ids, 1) is not null
    then 'partially_approved'
    else 'approved'
  end;

  select user_id, member_position into v_other_user_id, v_other_position
  from public.relationship_members
  where relationship_id = v_expense.relationship_id and user_id <> v_expense.created_by;

  v_owed_amount := round(
    v_eligible_amount * (
      case when v_other_position = 'parent_one'
        then v_expense.parent_one_percentage
        else v_expense.parent_two_percentage
      end
    ) / 100.0,
    2
  );

  update public.expenses
  set status = v_status,
      eligible_amount = v_eligible_amount,
      owed_amount = v_owed_amount,
      owed_by_user_id = v_other_user_id,
      owed_to_user_id = v_expense.created_by,
      decided_by = v_uid,
      decided_at = now(),
      updated_at = now()
  where id = p_expense_id;

  insert into public.audit_events (relationship_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_expense.relationship_id, v_uid, 'expense_' || v_status, 'expense', p_expense_id,
          jsonb_build_object('owed_amount', v_owed_amount));

  perform public._recalculate_balance(v_expense.relationship_id);

  return jsonb_build_object('expense_id', p_expense_id, 'status', v_status, 'owed_amount', v_owed_amount);
end;
$$;

create or replace function public.reject_expense(p_expense_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_expense public.expenses%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'expense_not_found';
  end if;

  if not exists (
    select 1 from public.relationship_members
    where relationship_id = v_expense.relationship_id and user_id = v_uid
  ) then
    raise exception 'not_relationship_member';
  end if;

  if v_expense.created_by = v_uid then
    raise exception 'cannot_reject_own_expense';
  end if;

  if v_expense.status <> 'submitted' then
    raise exception 'expense_not_submitted';
  end if;

  update public.expenses
  set status = 'rejected',
      status_reason = trim(p_reason),
      decided_by = v_uid,
      decided_at = now(),
      updated_at = now()
  where id = p_expense_id;

  insert into public.audit_events (relationship_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_expense.relationship_id, v_uid, 'expense_rejected', 'expense', p_expense_id,
          jsonb_build_object('reason', trim(p_reason)));

  return jsonb_build_object('expense_id', p_expense_id, 'status', 'rejected');
end;
$$;

create or replace function public.request_expense_changes(p_expense_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_expense public.expenses%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_expense from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'expense_not_found';
  end if;

  if not exists (
    select 1 from public.relationship_members
    where relationship_id = v_expense.relationship_id and user_id = v_uid
  ) then
    raise exception 'not_relationship_member';
  end if;

  if v_expense.created_by = v_uid then
    raise exception 'cannot_request_changes_on_own_expense';
  end if;

  if v_expense.status <> 'submitted' then
    raise exception 'expense_not_submitted';
  end if;

  update public.expenses
  set status = 'changes_requested',
      status_reason = nullif(trim(coalesce(p_reason, '')), ''),
      decided_by = v_uid,
      decided_at = now(),
      updated_at = now()
  where id = p_expense_id;

  insert into public.audit_events (relationship_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_expense.relationship_id, v_uid, 'expense_changes_requested', 'expense', p_expense_id,
          jsonb_build_object('reason', p_reason));

  return jsonb_build_object('expense_id', p_expense_id, 'status', 'changes_requested');
end;
$$;

-- ============================================================
-- 7. Grants — explicit revoke-then-grant on every function
-- (Supabase's default privileges otherwise leave EXECUTE open to anon).
-- _recalculate_balance gets NO grant to any role, ever — internal only.
-- ============================================================
revoke all on function public.create_expense(uuid, uuid, text, date, jsonb, uuid[], int, int) from public, anon, authenticated;
grant execute on function public.create_expense(uuid, uuid, text, date, jsonb, uuid[], int, int) to authenticated;

revoke all on function public.update_expense(uuid, uuid, text, date, jsonb, uuid[], int, int) from public, anon, authenticated;
grant execute on function public.update_expense(uuid, uuid, text, date, jsonb, uuid[], int, int) to authenticated;

revoke all on function public.submit_expense(uuid) from public, anon, authenticated;
grant execute on function public.submit_expense(uuid) to authenticated;

revoke all on function public.approve_expense(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.approve_expense(uuid, uuid[]) to authenticated;

revoke all on function public.reject_expense(uuid, text) from public, anon, authenticated;
grant execute on function public.reject_expense(uuid, text) to authenticated;

revoke all on function public.request_expense_changes(uuid, text) from public, anon, authenticated;
grant execute on function public.request_expense_changes(uuid, text) to authenticated;

revoke all on function public._recalculate_balance(uuid) from public, anon, authenticated;

commit;
