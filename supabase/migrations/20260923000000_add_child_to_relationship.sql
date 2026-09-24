-- Migration: add_child_to_relationship
-- Applied manually via the Supabase SQL Editor against the approved
-- project (ref obctraterhwxarydjkhq). This file is the canonical,
-- as-applied record for review — NEVER edit an applied migration; add a
-- new one for any future change.
--
-- Purpose: allow either participant of an ACTIVE relationship to add a
-- child directly, without going through the propose/accept revision cycle
-- (which is blocked once relationships.status = 'active'). Additive and
-- data-preserving: no existing row, table, or grant is removed, and the
-- only constraint change is intentionally relaxing one NOT NULL (see
-- below) — no CHECK, FK, PK, or UNIQUE constraint is touched.
--
-- Pre/post migration verification (row counts, grant checks, nullability)
-- was performed manually in the SQL Editor before this file was committed;
-- see project history for the exact queries used.

begin;

-- A directly-added child has no revision snapshot to reference, so this
-- FK must become optional. All other constraints on children (PK, FK
-- relationship_id -> relationships(id), FK source_revision_child_id ->
-- relationship_revision_children, UNIQUE(source_revision_child_id), and
-- the full_name/date_of_birth/gender CHECK constraints) are unchanged.
alter table public.children
  alter column source_revision_child_id drop not null;

create or replace function public.add_child_to_relationship(
  p_relationship_id uuid,
  p_full_name text,
  p_date_of_birth date,
  p_gender text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_relationship public.relationships%rowtype;
  v_child_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_relationship_participant(p_relationship_id) then
    raise exception 'not_relationship_participant';
  end if;

  select * into v_relationship
  from public.relationships
  where id = p_relationship_id
  for update;

  if not found then
    raise exception 'relationship_not_found';
  end if;

  if v_relationship.status <> 'active' then
    raise exception 'relationship_not_active';
  end if;

  if length(trim(coalesce(p_full_name, ''))) = 0 then
    raise exception 'invalid_full_name';
  end if;

  if p_date_of_birth is null or p_date_of_birth > current_date then
    raise exception 'invalid_date_of_birth';
  end if;

  if p_gender is null or p_gender not in ('male', 'female', 'other') then
    raise exception 'invalid_gender';
  end if;

  insert into public.children (
    relationship_id,
    source_revision_child_id,
    full_name,
    date_of_birth,
    gender,
    active
  )
  values (
    p_relationship_id,
    null,
    trim(p_full_name),
    p_date_of_birth,
    p_gender,
    true
  )
  returning id into v_child_id;

  insert into public.audit_events (
    relationship_id,
    actor_user_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_relationship_id,
    v_uid,
    'child_added',
    'child',
    v_child_id,
    jsonb_build_object('full_name', trim(p_full_name))
  );

  return jsonb_build_object('child_id', v_child_id);
end;
$$;

-- Explicit revoke before grant: Supabase's default privileges auto-grant
-- EXECUTE to anon/authenticated at function-creation time. Never rely on
-- a bare "revoke from public".
revoke all on function public.add_child_to_relationship(uuid, text, date, text)
  from public, anon, authenticated;
grant execute on function public.add_child_to_relationship(uuid, text, date, text)
  to authenticated;

-- _activate_relationship's grants are intentionally NOT touched by this
-- migration — it must remain revoked from public, anon, and authenticated,
-- permanently (it has no internal auth.uid() check; the EXECUTE revoke is
-- the only thing preventing unauthorized relationship activation).

commit;
