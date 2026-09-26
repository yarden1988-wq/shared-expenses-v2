-- Migration: notification_outbox
-- NOT YET APPLIED — prepared for independent review (DATABASE_AGENT,
-- REVIEW_AGENT) ahead of an explicit go/no-go decision. This file is the
-- exact SQL to run, once approved. NEVER edit an applied migration; add a
-- new one for any future change.
--
-- Beta email notifications, outbox pattern. Design:
-- docs/architecture/notifications.md. In short:
--
--   RPC (existing, unchanged) --insert--> public.audit_events
--        --AFTER INSERT trigger--> public.notification_outbox (pending)
--   Edge Function send-notifications (pg_cron, every minute; separate
--   migration 20260927000100, applied only after the function is deployed)
--        --claim_notification_batch()--> sends via Resend
--        --complete_notification()--> sent / retry with backoff / failed
--
-- Initial event types (exact strings the live RPCs already write):
--   expense_submitted          -> the other member (needs approval)
--   expense_changes_requested  -> the expense's creator
--   payment_recorded           -> the payment's recipient (needs confirmation)
--
-- Why an outbox fed from audit_events:
-- - Zero changes to the applied money RPCs: every relevant state change
--   already writes an audit row inside the same transaction, so the
--   notification is enqueued atomically with the change (rolled-back RPC
--   => no notification) without re-declaring any RPC body.
-- - The enqueue trigger can NEVER fail the business transaction: all of
--   its logic runs inside an exception block that downgrades any error to
--   a WARNING and skips the notification. Money flow > email.
-- - Sending happens outside the transaction, with retries, backoff, a
--   stale-lock reclaim, a relevance re-check at send time (e.g. no "needs
--   approval" email for an expense already approved), and a provider
--   idempotency key (the outbox id) against duplicate sends.
--
-- Privacy / security:
-- - The outbox stores only ids + a kind — no amounts, merchant names,
--   reasons, notes, or receipt paths. audit_events.metadata (which for
--   changes-requested contains the free-text reason) is NOT copied.
-- - Recipient email is NOT stored; it's read from auth.users at claim
--   time, only inside a SECURITY DEFINER function executable solely by
--   service_role (used by the Edge Function runtime, never by the app).
-- - RLS enabled with NO policies + all table privileges revoked from
--   anon/authenticated AND service_role: clients can neither read nor
--   write the outbox, and the sender is confined to the two RPCs.
--
-- Pre-apply read-only checks (expected results in brackets):
--   -- audit_events.id is the primary key (FK target)            [1 row: PRIMARY KEY (id)]
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.audit_events'::regclass and contype = 'p';
--   -- relationship_members has the columns used here            [3 rows]
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'relationship_members'
--      and column_name in ('relationship_id', 'user_id', 'member_position');
--   -- no existing triggers on audit_events that could interact  [0 rows]
--   select tgname from pg_trigger where tgrelid = 'public.audit_events'::regclass and not tgisinternal;
--   -- names not taken                                            [null | null | null | null]
--   select to_regclass('public.notification_outbox'),
--          to_regprocedure('public._enqueue_notification_from_audit_event()'),
--          to_regprocedure('public.claim_notification_batch(integer)'),
--          to_regprocedure('public.complete_notification(uuid, text, text, text)');
--   -- set_updated_at() exists (reused)                           [not null]
--   select to_regprocedure('public.set_updated_at()');
--   -- clients cannot forge audit events (the trigger trusts audit rows,
--   -- so a client INSERT path would allow notification spam)        [false | 0 rows]
--   select has_table_privilege('authenticated', 'public.audit_events', 'INSERT')
--      and exists (select 1 from pg_policies where schemaname = 'public'
--                  and tablename = 'audit_events' and cmd in ('INSERT', 'ALL'));
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'audit_events' and cmd <> 'SELECT';
--   -- relationships.status exists (used by the relevance check)  [1 row]
--   select 1 from information_schema.columns
--    where table_schema = 'public' and table_name = 'relationships' and column_name = 'status';
--
-- NOT changed: any existing table, RPC, policy, grant, or the receipts
-- storage layer. No secrets in this file.

begin;

-- ============================================================
-- 1. Outbox table
-- ============================================================
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  -- cascade: a notification is meaningless without its source row, and the
  -- outbox must never become a new blocker for a future delete/cleanup.
  audit_event_id uuid not null references public.audit_events (id) on delete cascade,
  relationship_id uuid not null references public.relationships (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null
    check (kind in ('expense_submitted', 'expense_changes_requested', 'payment_recorded')),
  entity_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts int not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  provider_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Idempotent enqueue: one notification per (event, recipient).
  constraint notification_outbox_event_recipient_key unique (audit_event_id, recipient_user_id)
);

-- Claim scan: only open rows, oldest first.
create index if not exists notification_outbox_open_idx
  on public.notification_outbox (next_attempt_at)
  where status in ('pending', 'processing');

-- FK cascade from auth.users / dedupe lookups.
create index if not exists notification_outbox_recipient_idx
  on public.notification_outbox (recipient_user_id);

alter table public.notification_outbox enable row level security;
-- Deliberately NO policies: no client role may read or write the outbox.
-- service_role is revoked too (it bypasses RLS): the sender may ONLY use
-- the two SECURITY DEFINER RPCs below, which run as the table owner.
revoke all on table public.notification_outbox from public, anon, authenticated, service_role;

drop trigger if exists set_notification_outbox_updated_at on public.notification_outbox;
create trigger set_notification_outbox_updated_at
  before update on public.notification_outbox
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2. Enqueue trigger on audit_events
-- ============================================================
create or replace function public._enqueue_notification_from_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient uuid;
  v_other_count int;
begin
  begin
    if new.entity_id is null then
      return new;
    end if;

    if new.event_type = 'expense_submitted' then
      -- The approver: the (single) other member of the relationship.
      select count(*), min(rm.user_id::text)::uuid
        into v_other_count, v_recipient
      from public.relationship_members rm
      where rm.relationship_id = new.relationship_id
        and rm.user_id is not null
        and rm.user_id is distinct from new.actor_user_id;
      if v_other_count <> 1 then
        return new; -- incomplete/ambiguous membership: skip, never guess
      end if;

    elsif new.event_type = 'expense_changes_requested' then
      select e.created_by into v_recipient
      from public.expenses e
      where e.id = new.entity_id and e.relationship_id = new.relationship_id;

    elsif new.event_type = 'payment_recorded' then
      select p.recipient_user_id into v_recipient
      from public.payments p
      where p.id = new.entity_id and p.relationship_id = new.relationship_id;

    else
      return new;
    end if;

    if v_recipient is null or v_recipient is not distinct from new.actor_user_id then
      return new;
    end if;

    insert into public.notification_outbox (audit_event_id, relationship_id, recipient_user_id, kind, entity_id)
    values (new.id, new.relationship_id, v_recipient, new.event_type, new.entity_id)
    on conflict (audit_event_id, recipient_user_id) do nothing;
  exception when others then
    -- Never let a notification problem roll back a money action.
    raise warning 'notification enqueue skipped for audit event %: % (%)', new.id, sqlerrm, sqlstate;
  end;

  return new;
end;
$$;

revoke all on function public._enqueue_notification_from_audit_event() from public, anon, authenticated;

drop trigger if exists enqueue_notification_from_audit_event on public.audit_events;
create trigger enqueue_notification_from_audit_event
  after insert on public.audit_events
  for each row
  when (new.event_type in ('expense_submitted', 'expense_changes_requested', 'payment_recorded'))
  execute function public._enqueue_notification_from_audit_event();

-- ============================================================
-- 3. Sender API (service_role only)
-- ============================================================

-- Claims up to p_limit (1..50) due notifications for sending. Before
-- claiming, it retires rows that are no longer relevant (the entity moved
-- on, or the recipient left the relationship) as 'skipped', and rows whose
-- stale lock outlived the max attempts as 'failed'. A 'processing' row
-- whose lock is older than 15 minutes (sender crashed mid-send) is
-- reclaimed; the provider idempotency key (= outbox id) prevents a
-- duplicate email if the first send actually went out.
create or replace function public.claim_notification_batch(p_limit int default 20)
returns table (
  notification_id uuid,
  notification_kind text,
  relationship_id uuid,
  entity_id uuid,
  recipient_email text,
  attempt int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  -- One claimer at a time: the retire/skip UPDATEs below don't use SKIP
  -- LOCKED, so overlapping runs could block or deadlock. A concurrent run
  -- simply returns nothing and the next minute picks up.
  if not pg_try_advisory_xact_lock(hashtext('public.claim_notification_batch')) then
    return;
  end if;

  update public.notification_outbox o
  set status = 'failed', locked_at = null, last_error = 'max_attempts_exceeded'
  where o.status = 'processing'
    and o.locked_at < now() - interval '15 minutes'
    and o.attempts >= 5;

  update public.notification_outbox o
  set status = 'skipped', locked_at = null, last_error = 'no_longer_relevant'
  where (o.status = 'pending' or (o.status = 'processing' and o.locked_at < now() - interval '15 minutes'))
    and o.next_attempt_at <= now()
    and (
      not exists (
        select 1 from public.relationship_members rm
        where rm.relationship_id = o.relationship_id and rm.user_id = o.recipient_user_id
      )
      or not exists (
        select 1 from public.relationships r
        where r.id = o.relationship_id and r.status = 'active'
      )
      -- superseded: a newer notification of the same kind for the same
      -- entity and recipient exists (e.g. resubmitted before the first
      -- email went out) — send only the latest.
      or exists (
        select 1 from public.notification_outbox n2
        where n2.kind = o.kind and n2.entity_id = o.entity_id
          and n2.recipient_user_id = o.recipient_user_id
          and (n2.created_at, n2.id) > (o.created_at, o.id)
      )
      or case o.kind
        when 'expense_submitted' then not exists (
          select 1 from public.expenses e where e.id = o.entity_id and e.status = 'submitted')
        when 'expense_changes_requested' then not exists (
          select 1 from public.expenses e where e.id = o.entity_id and e.status = 'changes_requested')
        when 'payment_recorded' then not exists (
          select 1 from public.payments p where p.id = o.entity_id and p.status = 'pending')
        else true
      end
    );

  return query
  with picked as (
    select o.id
    from public.notification_outbox o
    where (o.status = 'pending' and o.next_attempt_at <= now())
       or (o.status = 'processing' and o.locked_at < now() - interval '15 minutes')
    order by o.next_attempt_at, o.created_at
    limit v_limit
    for update skip locked
  ),
  claimed as (
    update public.notification_outbox o
    set status = 'processing', locked_at = now(), attempts = o.attempts + 1
    from picked
    where o.id = picked.id
    returning o.id, o.kind, o.relationship_id, o.entity_id, o.recipient_user_id, o.attempts
  )
  select c.id, c.kind, c.relationship_id, c.entity_id, u.email::text, c.attempts
  from claimed c
  left join auth.users u on u.id = c.recipient_user_id;
end;
$$;

-- Records the outcome of one send attempt. Only acts on a row that is
-- currently 'processing' (a late/duplicate completion is a no-op).
--   'sent'   -> sent (provider message id kept for support/debugging)
--   'retry'  -> transient failure: back to pending with exponential
--               backoff (2, 4, 8, 16 min), or 'failed' after 5 attempts
--   'failed' -> permanent failure (e.g. no email, provider 4xx)
create or replace function public.complete_notification(
  p_id uuid,
  p_outcome text,
  p_error text default null,
  p_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome = 'sent' then
    update public.notification_outbox
    set status = 'sent', sent_at = now(), locked_at = null, last_error = null,
        provider_message_id = nullif(left(p_provider_message_id, 200), '')
    where id = p_id and status = 'processing';
  elsif p_outcome = 'retry' then
    update public.notification_outbox
    set status = case when attempts >= 5 then 'failed' else 'pending' end,
        next_attempt_at = now() + make_interval(mins => power(2, least(attempts, 4))::int),
        locked_at = null,
        last_error = left(p_error, 500)
    where id = p_id and status = 'processing';
  elsif p_outcome = 'failed' then
    update public.notification_outbox
    set status = 'failed', locked_at = null, last_error = left(p_error, 500)
    where id = p_id and status = 'processing';
  else
    raise exception 'invalid_outcome';
  end if;
end;
$$;

revoke all on function public.claim_notification_batch(int) from public, anon, authenticated;
grant execute on function public.claim_notification_batch(int) to service_role;

revoke all on function public.complete_notification(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_notification(uuid, text, text, text) to service_role;

commit;
