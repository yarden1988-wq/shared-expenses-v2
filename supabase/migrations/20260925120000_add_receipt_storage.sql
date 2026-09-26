-- Migration: receipt_storage
-- NOT YET APPLIED — prepared and statically reviewed (DATABASE_AGENT,
-- REVIEW_AGENT) ahead of an explicit go/no-go decision. This file is the
-- exact SQL to run, once approved. NEVER edit an applied migration; add a
-- new one for any future change.
--
-- Adds the PRIVATE Supabase Storage bucket + storage.objects RLS policies
-- needed to make expenses.receipt_storage_path (added, nullable, unused
-- until now, in 20260924000000_add_expenses_approval_workflow.sql)
-- genuinely usable. Additive only — creates one storage bucket and three
-- storage.objects policies scoped to that bucket; touches NO existing
-- table, column, row, function, or grant in the `public` schema, and does
-- NOT alter any storage table (see section 2). No app code / upload UI is
-- built in this migration — schema/policy only, per an explicit "design
-- and stop before any live Storage/RLS change" gate.
--
-- Reused as-is, unchanged: expenses.receipt_storage_path (text, nullable)
-- and its existing validation in create_expense/update_expense:
--   p_receipt_storage_path not like ('relationships/' || relationship_id || '/%')
-- This migration's path convention and RLS policies are built to satisfy
-- that exact prefix check — they were designed together, not independently.
--
-- Pre-apply read-only checks (run first; expected results in brackets):
--   select relrowsecurity from pg_class where oid = 'storage.objects'::regclass;  [true]
--   select column_name from information_schema.columns
--    where table_schema = 'storage' and table_name = 'objects'
--      and column_name = 'owner_id';                                            [1 row]
--   select pg_get_function_identity_arguments('public.is_relationship_participant'::regproc),
--          pg_get_function_result('public.is_relationship_participant'::regproc); [uuid / boolean]
--
-- Design decisions:
-- - Bucket name: `receipts`. Created PRIVATE (public = false). No public
--   URL is ever generated for a receipt; the intended access pattern is
--   `createSignedUrl()` or an authenticated `.download()` call, both of
--   which enforce the SELECT policy below. No service_role anywhere.
-- - File size limit (10 MB) and allowed MIME types (jpeg/png/webp/pdf) are
--   enforced by Supabase's native per-bucket `file_size_limit` /
--   `allowed_mime_types` columns — no custom logic needed for this.
-- - Path convention: `relationships/<relationship_id>/<random_uuid>.<ext>`,
--   ENFORCED by an anchored, lowercase-only regex in every policy (not just
--   documented). Lowercase because relationship_id::text and
--   crypto.randomUUID() are lowercase and the RPC prefix LIKE is
--   case-sensitive. The random UUID filename avoids collisions and keeps
--   the original filename (possible PII) out of the path; <ext> must be one
--   of jpg|jpeg|png|webp|pdf, matching allowed_mime_types.
--   Deliberately NOT `.../<expense_id>/...`: a receipt must be uploaded
--   BEFORE create_expense() is called (the resulting path is passed in as
--   p_receipt_storage_path), so no expense_id exists yet at upload time.
-- - "Replace a receipt" is upload-new -> update_expense(new path) ->
--   delete-old; "remove a receipt" is update_expense(null) -> delete. Never
--   an in-place overwrite, so there is NO UPDATE policy: move() and
--   upload(..., { upsert: true }) are denied by design (app must use
--   upsert: false). The app must NEVER delete before update_expense — that
--   ordering is rejected by the DELETE policy (see below).
-- - Ownership uses `owner_id` (text) only. Supabase docs mark the legacy
--   `owner` uuid column deprecated ("Use owner_id instead"); referencing it
--   would create a policy->column dependency that a future storage-api
--   migration dropping `owner` would trip over. `owner_id` is set by the
--   Storage API from the uploader's JWT `sub`, never by the client. If it
--   were ever unpopulated, the checks fail CLOSED (uploads denied).
--   auth.uid() is wrapped as (select auth.uid()) so it is evaluated once
--   per statement, per Supabase RLS performance guidance.
-- - Every policy evaluates the uuid cast ONLY inside a CASE after the
--   regex has matched. Postgres does not guarantee AND evaluation order,
--   and these policies are checked against rows of every bucket; the CASE
--   guarantees a malformed name yields a clean deny, never a query error.
-- - SELECT policy: current relationship participant, AND either (a) you
--   uploaded the object, or (b) it is referenced by an expense you can
--   already see. (b) runs under the caller's own expenses_select RLS, so it
--   inherits that table's draft-privacy rule exactly: the other co-parent
--   cannot list/download receipts attached to your unsubmitted draft, nor
--   your not-yet-attached uploads, but the approver sees receipts on every
--   submitted/decided expense. Mirroring expenses_select (rather than the
--   whole relationship prefix) also stops a participant from discovering
--   another's unattached path and reusing it on their own expense.
-- - INSERT policy: current participant of the relationship in the path,
--   path matches the enforced convention, and owner_id is the caller. Not
--   restricted to "the expense's eventual creator" (no expense row exists
--   yet at upload time). Accepted tradeoff: orphaned uploads that never
--   become a receipt — a storage-bytes cost only, not an integrity issue.
--   Orphan cleanup is out of scope for Fast Beta.
-- - DELETE policy: uploader only, current participant only, and only
--   while NO expense visible to the caller references the object. This
--   closes delete-and-reupload tampering with a receipt behind a
--   submitted/approved expense (the approver's evidence). The participant
--   check is what makes the NOT EXISTS sound: a current participant sees
--   every non-draft expense in the relationship, whereas an ex-participant
--   would see none and could otherwise delete approved evidence.
--
-- Accepted residual risks, explicitly deferred:
-- - The other co-parent's DRAFTS are invisible to the DELETE subquery, so
--   if B's draft points at A's file, A may still delete it (leaving B's
--   draft with a dangling path). Practically unreachable now that SELECT no
--   longer exposes A's unattached paths to B; fully closing it would need a
--   SECURITY DEFINER helper in `public`, not worth the surface for beta.
--   The file is protected as soon as B submits.
-- - Recommended FOLLOW-UP migration before/with the upload UI (not here,
--   since it changes existing public RPCs): make create_expense/
--   update_expense require that the path exists in storage.objects
--   (bucket 'receipts', owner_id = caller) and matches the same strict
--   regex, instead of the current prefix-only LIKE.
-- - `allowed_mime_types` is enforced against the client-DECLARED
--   Content-Type, not sniffed bytes. When the download UI is built: serve
--   receipts only via createSignedUrl()/authenticated .download() with a
--   forced attachment disposition, never render fetched bytes
--   inline/unsandboxed, and confirm `X-Content-Type-Options: nosniff`.
-- - No index on expenses.receipt_storage_path (SELECT/DELETE subqueries);
--   fine at beta scale, revisit if receipt listing gets slow.
-- - No OCR, no multi-file-per-expense infrastructure.

begin;

-- ============================================================
-- 1. Bucket
-- `do update` (not `do nothing`) so this migration is corrective, not
-- just idempotent: a pre-existing `receipts` bucket with different
-- settings (e.g. public = true from manual testing) gets corrected.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================
-- 2. storage.objects RLS policies, scoped to bucket_id = 'receipts'.
-- RLS on storage.objects is enabled by Supabase and the table is owned by
-- supabase_storage_admin: do NOT `alter table` it (fails with 42501 and
-- would abort this whole transaction). CREATE/DROP POLICY is permitted.
-- Enforced path shape (anchored, lowercase):
--   relationships/<relationship_uuid>/<random_uuid>.<jpg|jpeg|png|webp|pdf>
-- ============================================================
drop policy if exists "receipts_select" on storage.objects;
create policy "receipts_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and case
      when name ~ '^relationships/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$'
        then public.is_relationship_participant(split_part(name, '/', 2)::uuid)
          and (
            owner_id = (select auth.uid())::text
            or exists (
              select 1 from public.expenses e
              where e.receipt_storage_path = storage.objects.name
            )
          )
      else false
    end
  );

drop policy if exists "receipts_insert" on storage.objects;
create policy "receipts_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and owner_id = (select auth.uid())::text
    and case
      when name ~ '^relationships/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$'
        then public.is_relationship_participant(split_part(name, '/', 2)::uuid)
      else false
    end
  );

drop policy if exists "receipts_delete" on storage.objects;
create policy "receipts_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and owner_id = (select auth.uid())::text
    and case
      when name ~ '^relationships/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$'
        then public.is_relationship_participant(split_part(name, '/', 2)::uuid)
      else false
    end
    and not exists (
      select 1 from public.expenses e
      where e.receipt_storage_path = storage.objects.name
    )
  );

-- No UPDATE policy: no in-place overwrite, no move(), no upsert: true.

commit;
