# Beta email notifications — architecture

Status: **designed, not live.** Nothing below is applied, deployed, or configured yet.

## Scope (Beta)

| Event (`audit_events.event_type`) | Recipient | Email says | Link |
|---|---|---|---|
| `expense_submitted` | the other relationship member | an expense is waiting for your approval | `/dashboard/relationships/<rid>/expenses/<id>` |
| `expense_changes_requested` | the expense's creator | changes were requested on your expense | same |
| `payment_recorded` | the payment's recipient | a payment is waiting for your confirmation | `/dashboard/relationships/<rid>/payments` |

Emails contain **only** a fixed Hebrew sentence and a link. They never include:
- amounts, merchant names, notes, or change/rejection reasons
- child or parent names
- receipts or receipt links

The recipient must sign in, and RLS decides what they see.

## Flow

```
money RPC (unchanged) ── inserts ──> audit_events
                                        │ AFTER INSERT trigger (same transaction; never raises)
                                        ▼
                                 notification_outbox  (pending)
                                        │
pg_cron (every minute) ── pg_net POST ──> Edge Function send-notifications
                                        │  claim_notification_batch()   (service_role only)
                                        │  Resend API (Idempotency-Key = outbox id)
                                        │  complete_notification()      (sent / retry / failed)
                                        ▼
                                 notification_outbox  (sent | failed | skipped)
```

### Why this design

- **Atomic with the business change, zero RPC changes.** Every relevant RPC already writes an audit row in its own transaction. So the notification is enqueued if and only if the change commits, and none of the applied money RPC bodies is re-declared.
- **Email can never break money flow.** The enqueue trigger wraps all of its logic in an exception block that downgrades any error to a warning.
- **Reliable delivery.**
  - Retries use exponential backoff (2/4/8/16 min) and stop at 5 attempts.
  - A row that stays locked more than 15 minutes (sender crashed) is reclaimed.
  - Resend's idempotency key (the outbox id) prevents duplicate emails when a send succeeded but its completion wasn't recorded.
- **No stale nags.** At send time, a row is marked `skipped` if its reason has already gone away:
  - the expense is no longer `submitted` / `changes_requested`;
  - the payment is no longer `pending`;
  - the recipient has left the relationship.
- **Least privilege.**
  - The outbox has RLS enabled with **no policies**, and table privileges are revoked from `anon`/`authenticated`.
  - The claim and complete RPCs are executable **only by `service_role`**.
  - The Next.js app never touches the outbox and never uses `service_role`. The key exists only inside the Supabase Edge runtime, where it is auto-injected.
  - **This is a deliberate, scoped `service_role` exception**, outside application code. Even there, the key has no table access to the outbox (revoked); it can only execute the two RPCs.
  - The sender validates its whole configuration *before* claiming anything, so a bad or missing secret can't burn queued notifications into `failed`.
  - Recipient emails are read from `auth.users` at claim time, never stored in the outbox.

### Alternatives considered

- **Send from the Next.js server action:** not atomic (the email can go out for a rolled-back change, or be lost on a crash). It would need `service_role` or a Resend key in the app, and it slows every money action.
- **Database Webhook on outbox insert:** lower latency, but it still needs cron for retries. A one-minute cron alone is simpler and fast enough for Beta.

## Files

- `supabase/migrations/20260927000000_add_notification_outbox.sql`: the outbox, the enqueue trigger, and the service_role-only RPCs.
- `supabase/migrations/20260927000100_schedule_notification_sender.sql`: pg_cron + pg_net job. It reads the URL and secret from Vault; no secrets are in git.
- `supabase/functions/send-notifications/index.ts`: the sender, which authenticates callers with `x-cron-secret` (compared in constant time).
- `supabase/functions/send-notifications/templates.ts`: pure Hebrew RTL templates and the link builder (UUID-validated, https only except localhost).

## Rollout — each step needs explicit owner approval

1. **Apply `20260927000000_add_notification_outbox.sql`.** Run the pre-apply checks in its header first.
   - Safe on its own: the outbox starts filling, and nothing is sent.
   - Post-apply:
     - submit an expense → one `pending` row for the other parent;
     - `select * from notification_outbox` as `authenticated` → permission denied.
2. **Resend:** create the account, verify the sending domain (SPF/DKIM), and create an API key with *sending access only*.
3. **Function secrets** (CLI or Dashboard; never commit):
   ```
   supabase secrets set RESEND_API_KEY=... NOTIFICATIONS_FROM="Shared Expenses <notify@your-domain>" \
     APP_BASE_URL=https://<production-app-url> NOTIFICATIONS_CRON_SECRET=<32+ random bytes>
   ```
4. **Deploy the function:** `supabase functions deploy send-notifications --no-verify-jwt`.
   - `supabase/config.toml` also pins `verify_jwt = false`, so a redeploy without the flag can't silently stop email.
   - The anon key is public, so JWT verification would not restrict callers; the cron secret (32 characters minimum) does.
   - Smoke test: a POST without the header returns 401, and a POST with it returns `{"claimed":…}`.
5. **Vault secrets:** `notifications_function_url` and `notifications_cron_secret` (Dashboard → Vault).
6. **Apply `20260927000100_schedule_notification_sender.sql`.**
7. **Two-user acceptance:**
   - submit → B gets an email;
   - request changes → A gets an email;
   - record a payment → the recipient gets an email;
   - approve before the next minute → the row is `skipped`, and no email is sent.

## Operations

- Health:
  ```sql
  select status, count(*) from notification_outbox group by 1;
  select * from notification_outbox where status = 'failed' order by updated_at desc limit 20;
  ```
- **Changing `APP_BASE_URL`:** rows mid-retry at that moment will fail with Resend 409, because the idempotency key was reused with a different body. This is accepted; the affected emails are simply not sent.
- **Pause sending:** `select cron.unschedule('send-notifications');`. The outbox keeps filling, and sending resumes once the job is rescheduled.
- **Not in Beta:**
  - per-user notification preferences and unsubscribe (these are transactional emails);
  - digests;
  - push/SMS;
  - retention cleanup of `sent`/`skipped` rows.
