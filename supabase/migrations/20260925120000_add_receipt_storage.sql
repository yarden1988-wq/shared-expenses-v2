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
-- table, column, row, function, or grant in the `public` schema. No app
-- code / upload UI is built in this migration — schema/policy only, per
-- an explicit "design and stop before any live Storage/RLS change" gate.
--
-- Reused as-is, unchanged: expenses.receipt_storage_path (text, nullable)
-- and its existing validation in create_expense/update_expense:
--   p_receipt_storage_path not like ('relationships/' || relationship_id || '/%')
-- This migration's path convention and RLS policies are built to satisfy
-- that exact prefix check — they were designed together, not independently.
--
-- Design decisions:
-- - Bucket name: `receipts`. Created PRIVATE (public = false). No public
--   URL is ever generated for a receipt; the intended access pattern is
--   `createSignedUrl()` or an authenticated `.download()` call, both of
--   which enforce the SELECT policy below at generation/request time —
--   there is no way to bypass RLS by asking for a "public" URL, because
--   this bucket is never public in the first place.
-- - File size limit (10 MB) and allowed MIME types (jpeg/png/webp/pdf) are
--   enforced by Supabase's native per-bucket `file_size_limit` /
--   `allowed_mime_types` columns — no custom trigger/RLS logic needed for
--   this; Supabase Storage itself rejects a disallowed upload before it
--   ever reaches the object store.
-- - Path convention: `relationships/<relationship_id>/<random_uuid>.<ext>`.
--   Deliberately NOT `relationships/<relationship_id>/<expense_id>/...`:
--   a receipt must be uploadED to Storage BEFORE create_expense() is
--   called (the resulting path is passed in as p_receipt_storage_path),
--   so no expense_id exists yet at upload time — this is a genuine
--   chicken-and-egg constraint, not a simplification. The random UUID
--   filename avoids collisions and avoids leaking the original filename
--   (which could contain PII) into a path segment.
-- - "Replace a receipt" is upload-new + update_expense(new path) +
--   delete-old, never an in-place overwrite. This needs no UPDATE policy
--   on storage.objects at all — only SELECT, INSERT, DELETE — and avoids
--   any partial-overwrite race between two people editing at once.
-- - SELECT policy: any relationship participant may view/download ANY
--   receipt under that relationship's prefix, regardless of who uploaded
--   it or which expense (if any) currently references it. This matches
--   the existing expenses_select-style participancy model (both
--   co-parents can already see each other's non-draft expenses) and is
--   necessary for the approver to actually review a submitted receipt.
-- - INSERT policy: any relationship participant may upload under that
--   relationship's prefix. This is intentionally NOT restricted to "only
--   the expense's eventual creator," because at upload time there is no
--   expense row yet to check ownership against (see path convention
--   above) — enforcing that would require a two-step
--   reserve-then-upload flow this design deliberately avoids for
--   simplicity. The accepted tradeoff: a participant could upload an
--   orphaned file into the shared namespace that never becomes anyone's
--   receipt. This is a harmless storage-bytes cost, not a security or
--   data-integrity issue — an uploaded object only ever affects real data
--   once create_expense/update_expense is called with its exact path,
--   and those RPCs already enforce the caller is the expense's own
--   creator and the expense is in draft/changes_requested. Orphan cleanup
--   is explicitly out of scope for Fast Beta (a future scheduled job, not
--   needed now).
-- - DELETE policy: restricted to "you uploaded this object." Supabase
--   Storage auto-populates the uploader's identity on insert, but which
--   column actually carries it depends on the project's Storage API
--   version — the legacy `owner uuid` column, the newer `owner_id text`
--   column, or (on current versions) both. Rather than assume one without
--   live verification, this checks both, so the policy works regardless
--   of which the running Storage API populates; neither column is
--   client-settable via this policy (Storage sets them from the
--   authenticated uploader's identity, not from anything in our `using`
--   clause), so checking both widens correctness, not the trust boundary.
--   This is exactly what the replace-a-receipt flow needs (the same user
--   who uploads the replacement is the one who uploaded the original)
--   without any fragile join back to `expenses` (which would break for an
--   already-orphaned or already-replaced object no longer referenced by
--   any expense row).
-- - No OCR, no multi-file-per-expense infrastructure — still schema-prep
--   plus this storage layer only, matching the original scope note in
--   the expenses migration.
--
-- Accepted residual risk, explicitly deferred to the future upload/
-- download UI (not fixable at this schema/policy layer): `allowed_
-- mime_types` is enforced against the client-DECLARED Content-Type, not
-- by sniffing actual file bytes, so a participant could upload a
-- mislabeled payload (e.g. HTML/SVG/JS declared as image/jpeg) that later
-- gets downloaded/previewed by the other co-parent. When the upload/
-- download UI is built: always serve receipts via `createSignedUrl()` or
-- an authenticated `.download()` call with a forced attachment
-- disposition, never render fetched bytes inline/unsandboxed in the
-- browser, and confirm the Storage response sends
-- `X-Content-Type-Options: nosniff`. Independently reviewed and accepted
-- as out of scope for a schema-only migration with no app code yet.

begin;

-- ============================================================
-- 1. Bucket
-- `do update` (not `do nothing`) so this migration is corrective, not
-- just idempotent: if a `receipts` bucket already exists from earlier
-- manual testing with different settings (e.g. public = true), re-running
-- this migration enforces the intended private/size/MIME configuration
-- rather than silently leaving a stale misconfiguration in place.
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
-- 2. storage.objects RLS policies, scoped to bucket_id = 'receipts' only.
-- Explicit (harmless if already enabled — Supabase enables this by
-- default, but cheap insurance given how consequential a silently
-- RLS-disabled storage.objects would be).
-- ============================================================
alter table storage.objects enable row level security;

-- storage.foldername(name) splits the object's full path by '/' and
-- returns every segment except the filename. For
-- 'relationships/<relationship_id>/<uuid>.<ext>' that's
-- {'relationships', '<relationship_id>'} — index 2 is the relationship id.
-- The array_length check is cheap defense-in-depth against a malformed
-- path with the wrong segment count (e.g. a bare filename with no
-- folders, or an extra nested segment) reaching the uuid cast at all.
drop policy if exists "receipts_select" on storage.objects;
create policy "receipts_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'relationships'
    and public.is_relationship_participant(((storage.foldername(name))[2])::uuid)
  );

-- `owner`/`owner_id` are also asserted here (not just relied upon
-- implicitly): Storage sets them from the authenticated uploader's
-- identity as part of the same insert this check evaluates, so asserting
-- it costs nothing and matches this app's existing "cheap defense in
-- depth" convention (e.g. the payments migration's payer<>recipient
-- CHECK constraint) rather than depending solely on Storage's own
-- internal behavior.
drop policy if exists "receipts_insert" on storage.objects;
create policy "receipts_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = 'relationships'
    and public.is_relationship_participant(((storage.foldername(name))[2])::uuid)
    and (owner = auth.uid() or owner_id = (auth.uid())::text)
  );

drop policy if exists "receipts_delete" on storage.objects;
create policy "receipts_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and (owner = auth.uid() or owner_id = (auth.uid())::text)
  );

-- No UPDATE policy: replacing a receipt is upload-new + update_expense +
-- delete-old, never an in-place overwrite (see header comment).

commit;
