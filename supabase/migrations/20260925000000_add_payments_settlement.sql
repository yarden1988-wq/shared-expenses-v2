-- Migration: payments_settlement
-- NOT YET APPLIED — prepared and statically reviewed (DATABASE_AGENT,
-- REVIEW_AGENT) ahead of an explicit go/no-go decision. This file is the
-- exact SQL to run, once approved. NEVER edit an applied migration; add a
-- new one for any future change.
--
-- Completes the Fast Beta money loop after approved expenses: lets either
-- relationship member record a payment they made to the other, which the
-- recipient must confirm before it affects the balance. Additive only —
-- creates 1 new table and 3 new functions, and CREATE OR REPLACEs the
-- existing zero-grant internal `_recalculate_balance` to also net out
-- approved payments. That replace is additive/backward-safe: the function
-- has never had any external grant (only ever called internally via
-- `perform`), so its contract with every existing caller is unchanged —
-- only its internal math is extended. No existing table, row, or grant is
-- touched otherwise.
--
-- Design decisions:
-- - No per-expense settlement tracking, no linking a payment to a specific
--   expense. Payments settle the relationship's one cumulative net balance
--   directly, exactly like expenses only ever adjust that same cumulative
--   number — this is a deliberate continuation of the existing
--   `balances` design (one net row, no period scoping), not a parallel
--   model. A payment is just a signed adjustment to the same ledger an
--   approved expense adjusts, with the opposite sign convention (see the
--   worked examples below).
-- - `record_payment` never accepts a recipient parameter from the client.
--   The recipient is resolved server-side as "the other member of this
--   two-person relationship" (the same pattern `approve_expense` already
--   uses to resolve its counterparty), which structurally eliminates
--   self-payment and unrelated-recipient tampering rather than only
--   catching them with a runtime check. A `payer_user_id <> recipient_
--   user_id` CHECK constraint is added anyway, as cheap defense in depth.
-- - `record_payment` is intentionally NOT gated on `relationship.status =
--   'active'` the way `create_expense` is. Debt can only have accumulated
--   while the relationship was active (expenses require it), so settling
--   that debt must remain possible in 'archive_requested'/'archived' too
--   — otherwise a relationship that goes inactive with an outstanding
--   balance could never be settled. It IS blocked for 'pending_invitee'/
--   'pending_inviter'/'rejected', since no expense could ever have existed
--   in those states — there is nothing to settle yet.
-- - `approve_payment`/`reject_payment` are likewise NOT gated on
--   relationship-active status, for the same reason `reject_expense` isn't
--   in the expenses migration: a pending payment must always have a way
--   to resolve, even on an archived relationship.
-- - No cap validating a payment amount against the current outstanding
--   balance. Overpayment is allowed and simply flips the sign of the net
--   balance (see Example 2 below) — validating against a client-supplied
--   "current balance" would be racy (another approval could land between
--   read and write) and isn't needed for correctness; the ledger is exact
--   either way.
-- - No payer-side cancel/withdraw action for a still-pending payment.
--   Genuinely useful for correcting a mistaken entry, but not asked for
--   and not required for the money loop to be complete — deferred rather
--   than silently built, since it's an easy additive follow-up (a
--   `cancel_payment` RPC gated on `payer_user_id = auth.uid() and status =
--   'pending'`) if wanted later.
--
-- Balance math — worked examples (parent_one = Alice, parent_two = Bob,
-- matching the existing sign convention: net_amount > 0 means parent_two
-- owes parent_one; net_amount < 0 means parent_one owes parent_two):
--
--   Example 1 — normal settlement:
--     E1 approved, owed_by=Bob, owed_to=Alice, owed_amount=100
--       -> net = +100 (Bob owes Alice 100)
--     P1 approved, payer=Bob, recipient=Alice, amount=40
--       -> payer is parent_two -> contributes -40 -> net = +60
--     P2 approved, payer=Bob, recipient=Alice, amount=60
--       -> contributes -60 -> net = 0 (מאוזן / settled)
--
--   Example 2 — overpayment flips the sign (expected, not a bug):
--     starting from net = 0 (as above), Bob pays Alice another 20
--       -> contributes -20 -> net = -20
--       -> convention: negative = parent_one owes parent_two, so Alice
--          now "owes" Bob 20 (an advance/credit toward future expenses).
--
--   Example 3 — payment in the other direction:
--     starting from net = +100 (Example 1's E1 alone, no payments yet),
--     Alice pays Bob 30 (e.g. an unrelated reimbursement)
--       -> payer=Alice is parent_one -> contributes +30 -> net = +130
--       -> correct: Alice just gave Bob 30 more, on top of Bob already
--          owing her 100, so Bob's total obligation to Alice increases.
--          This is the same arithmetic Splitwise/Venmo-style running
--          ledgers use — payments and debts are just signed contributions
--          to one running total, from two independent people.
--
--   Cross-check: the same net values are independently reproducible from
--   the app layer's per-user aggregation (owed_to_user_id/owed_by_user_id
--   and payer_user_id/recipient_user_id compared directly against the
--   current auth.uid(), the same technique already used for the expenses
--   balance display — no relationship_members lookup needed there either,
--   since payments/expenses only ever involve the two real participants).

begin;

-- ============================================================
-- 1. payments
-- ============================================================
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships (id),
  payer_user_id uuid not null references auth.users (id),
  recipient_user_id uuid not null references auth.users (id),
  amount numeric(10,2) not null check (amount > 0),
  payment_date date not null check (payment_date <= current_date),
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  status_reason text,
  created_by uuid not null references auth.users (id),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Defense in depth: record_payment() already structurally guarantees
  -- this by resolving the recipient as "the other member," never from a
  -- client parameter, but a DB-level guarantee costs nothing extra.
  constraint payments_payer_recipient_different check (payer_user_id <> recipient_user_id)
);

create index if not exists payments_relationship_id_idx on public.payments (relationship_id);
create index if not exists payments_payer_user_id_idx on public.payments (payer_user_id);
create index if not exists payments_status_idx on public.payments (status);

alter table public.payments enable row level security;

-- Unlike draft expenses, a pending payment is visible to BOTH participants
-- immediately — the recipient must be able to see it to approve/reject it.
-- There is no privacy concept analogous to expense drafts here.
drop policy if exists "payments_select" on public.payments;
create policy "payments_select"
  on public.payments
  for select
  to authenticated
  using (public.is_relationship_participant(relationship_id));

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ============================================================
-- 2. Functions
-- ============================================================

-- Extends the existing internal balance recompute to also net out
-- approved payments. Still zero-grant, still internal-only, still fully
-- recomputed from source rows every time (idempotent, retry-safe) rather
-- than incrementally adjusted — same philosophy as the original.
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

  -- Approved payments reduce debt in the direction paid — the OPPOSITE
  -- sign of an equivalent expense debt, since a payment is money already
  -- moved, not money owed. `payer_user_id` plays the same "debtor" role
  -- `owed_by_user_id` plays for expenses, so the sign is flipped relative
  -- to that formula. See the worked examples in the header comment.
  v_net := v_net + coalesce((
    select sum(
      case
        when payer_user_id = v_parent_two_id then -amount
        when payer_user_id = v_parent_one_id then amount
        else 0
      end
    )
    from public.payments
    where relationship_id = p_relationship_id
      and status = 'approved'
  ), 0);

  insert into public.balances (relationship_id, net_amount, updated_at)
  values (p_relationship_id, v_net, now())
  on conflict (relationship_id) do update
    set net_amount = excluded.net_amount,
        updated_at = excluded.updated_at;
end;
$$;

create or replace function public.record_payment(
  p_relationship_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_relationship public.relationships%rowtype;
  v_recipient_user_id uuid;
  v_payment_id uuid;
  v_amount numeric(10,2);
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

  -- Payments settle debt that can only exist once a relationship has been
  -- active (expenses require relationship.status = 'active' to be
  -- created), so a payment is meaningful in any status that could have
  -- accumulated real debt: active itself, or archived/archive_requested
  -- afterward. Deliberately NOT allowed for pending_invitee/pending_
  -- inviter/rejected — no expense could ever have existed yet in those
  -- states, so there is nothing to settle.
  if v_relationship.status not in ('active', 'archive_requested', 'archived') then
    raise exception 'relationship_not_settleable';
  end if;

  -- Rounded to the column's own precision before validating, mirroring
  -- approve_expense's round(...,2) pattern: a sub-cent value like 0.001
  -- would otherwise pass this check but round to 0.00 on insert, tripping
  -- the `amount > 0` CHECK constraint as a raw Postgres error instead of
  -- this clean exception.
  v_amount := round(p_amount, 2);
  if v_amount is null or v_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  if p_payment_date is null or p_payment_date > current_date then
    raise exception 'invalid_payment_date';
  end if;

  -- Recipient is never taken from the client — resolved as "the other
  -- member of this two-person relationship," exactly like approve_expense
  -- resolves its counterparty. This removes an entire class of
  -- parameter-tampering bug rather than merely checking for it after the
  -- fact, and structurally makes self-payment impossible (v_uid is
  -- excluded from the lookup).
  select user_id into v_recipient_user_id
  from public.relationship_members
  where relationship_id = p_relationship_id and user_id <> v_uid;

  if v_recipient_user_id is null then
    raise exception 'relationship_members_incomplete';
  end if;

  insert into public.payments (
    relationship_id, payer_user_id, recipient_user_id, amount, payment_date, note, created_by
  )
  values (
    p_relationship_id, v_uid, v_recipient_user_id, v_amount, p_payment_date,
    nullif(trim(coalesce(p_note, '')), ''), v_uid
  )
  returning id into v_payment_id;

  insert into public.audit_events (relationship_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (p_relationship_id, v_uid, 'payment_recorded', 'payment', v_payment_id,
          jsonb_build_object('amount', v_amount));

  return jsonb_build_object('payment_id', v_payment_id);
end;
$$;

create or replace function public.approve_payment(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_payment public.payments%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;

  -- Membership checked before the recipient/status checks so a
  -- non-participant holding a valid payment id learns nothing about it
  -- before being rejected — same info-oracle discipline as the expense
  -- RPCs.
  if not exists (
    select 1 from public.relationship_members
    where relationship_id = v_payment.relationship_id and user_id = v_uid
  ) then
    raise exception 'not_relationship_member';
  end if;

  -- Only the recipient can confirm a payment was actually received.
  -- Identity comes only from auth.uid(), never a client parameter; the
  -- payer_user_id <> recipient_user_id constraint means this also
  -- structurally excludes the payer.
  if v_uid <> v_payment.recipient_user_id then
    raise exception 'not_payment_recipient';
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'payment_not_pending';
  end if;

  update public.payments
  set status = 'approved',
      decided_by = v_uid,
      decided_at = now(),
      updated_at = now()
  where id = p_payment_id;

  insert into public.audit_events (relationship_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_payment.relationship_id, v_uid, 'payment_approved', 'payment', p_payment_id,
          jsonb_build_object('amount', v_payment.amount));

  perform public._recalculate_balance(v_payment.relationship_id);

  return jsonb_build_object('payment_id', p_payment_id, 'status', 'approved');
end;
$$;

create or replace function public.reject_payment(p_payment_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_payment public.payments%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason_required';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;

  if not exists (
    select 1 from public.relationship_members
    where relationship_id = v_payment.relationship_id and user_id = v_uid
  ) then
    raise exception 'not_relationship_member';
  end if;

  if v_uid <> v_payment.recipient_user_id then
    raise exception 'not_payment_recipient';
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'payment_not_pending';
  end if;

  -- No relationship-active gate here either, for the same reason
  -- reject_expense has none: a pending payment must always have a way to
  -- resolve, even on an archived relationship — rejecting has no
  -- financial effect, so there is nothing unsafe about allowing it
  -- unconditionally.
  update public.payments
  set status = 'rejected',
      status_reason = trim(p_reason),
      decided_by = v_uid,
      decided_at = now(),
      updated_at = now()
  where id = p_payment_id;

  insert into public.audit_events (relationship_id, actor_user_id, event_type, entity_type, entity_id, metadata)
  values (v_payment.relationship_id, v_uid, 'payment_rejected', 'payment', p_payment_id,
          jsonb_build_object('reason', trim(p_reason)));

  return jsonb_build_object('payment_id', p_payment_id, 'status', 'rejected');
end;
$$;

-- ============================================================
-- 3. Grants — explicit revoke-then-grant on every function
-- (Supabase's default privileges otherwise leave EXECUTE open to anon).
-- _recalculate_balance's grants are UNCHANGED by this migration — it must
-- remain revoked from public, anon, and authenticated, permanently.
-- ============================================================
revoke all on function public.record_payment(uuid, numeric, date, text) from public, anon, authenticated;
grant execute on function public.record_payment(uuid, numeric, date, text) to authenticated;

revoke all on function public.approve_payment(uuid) from public, anon, authenticated;
grant execute on function public.approve_payment(uuid) to authenticated;

revoke all on function public.reject_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.reject_payment(uuid, text) to authenticated;

commit;
