# Notifications rollout — owner runbook

Architecture: `docs/architecture/notifications.md`. Every numbered step changes an external system and
needs the owner's explicit go. Do them in order. **Never paste a secret into chat, git, or the SQL editor.**

| | State |
|---|---|
| `20260927000000_add_notification_outbox.sql` | ✅ applied + verified |
| Edge Function `send-notifications` | ⏳ not deployed |
| Resend | ⏳ not configured |
| `20260927000100_schedule_notification_sender.sql` (cron) | ⏳ not applied |

Until step 6, **no email is ever sent**: the outbox fills with `pending` rows, and nothing drains it.

---

## Step 0: Decide the link target (`APP_BASE_URL`)

Emails link back into the app, and the app is **not deployed yet**. Choose one:

- **A. Beta acceptance before production (recommended now):** `APP_BASE_URL=http://localhost:3000` **and** `NOTIFICATIONS_ALLOW_LOCALHOST_LINKS=true`.
  - Emails really are delivered, but their links only open on the machine running `npm run dev`.
  - Good enough to verify delivery, content and recipients.
  - Without the flag, the function refuses a localhost URL, so production can't email localhost links by mistake.
- **B. After the production deploy is approved:** `APP_BASE_URL=https://<production-domain>`, and **delete** `NOTIFICATIONS_ALLOW_LOCALHOST_LINKS`.
  - https is required; any other `http://` URL is refused.

Switching A→B later is just a secret update. Only rows that are mid-retry at that moment can fail (Resend 409); that is accepted.

Also confirm **Dashboard → Authentication → Providers → Email → "Confirm email" is ON**. The sender emails the account's address, so it must be a verified one.

## Step 1: Resend account and sending domain

1. Sign up at https://resend.com. Enable 2FA.
2. **Domains → Add Domain.** Use a **subdomain you control**, e.g. `mail.<your-domain>`, so the app's sending reputation stays separate from your main domain.
   - Region: **eu-west-1 (Ireland)**, the closest to Israel.
3. Add every DNS record Resend shows, exactly as shown, at your DNS provider:
   - the SPF `TXT` and `MX` records on `send.mail.<your-domain>`;
   - the DKIM `TXT` record on `resend._domainkey.mail.<your-domain>`.
4. Recommended: a DMARC `TXT` record on `_dmarc.<your-domain>` with value `v=DMARC1; p=none; rua=mailto:<you>@<your-domain>`, unless you already have one.
5. Click **Verify DNS Records** and wait until the domain shows **Verified**. This usually takes minutes, but can take hours.
6. Under the domain's settings, **disable click tracking and open tracking**.
   - Click tracking rewrites links through Resend's servers.
   - Open tracking adds a pixel.
   - Neither is wanted for private family finance mail.

> No domain? Resend's shared `onboarding@resend.dev` sender can only email **your own Resend account address**. That's enough for a one-person smoke test, not for the two-user acceptance.

## Step 2: Restricted API key

1. **API Keys → Create API Key.**
   - Name: `shared-expenses-beta-sender`
   - Permission: **Sending access** (not Full access)
   - Domain: **only** the domain verified in Step 1
2. Copy the key (it starts with `re_`). It's shown once. Keep it in your password manager until Step 3.

## Step 3: Edge Function secrets

Generate the cron secret locally. It needs 32+ random characters; this prints 64:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set the secrets in **Supabase Dashboard → Edge Functions → Secrets**. The Dashboard keeps them out of your shell history; the CLI's `secrets set` doesn't.

| Name | Value |
|---|---|
| `RESEND_API_KEY` | the `re_…` key from Step 2 |
| `NOTIFICATIONS_FROM` | `Shared Expenses <notify@mail.<your-domain>>`. Must use the verified domain. An ASCII display name is safest. |
| `APP_BASE_URL` | from Step 0 |
| `NOTIFICATIONS_ALLOW_LOCALHOST_LINKS` | `true`, **only** for Step 0 option A; otherwise don't set it |
| `NOTIFICATIONS_CRON_SECRET` | the generated value; keep it for Step 5 |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically; don't set them. Confirm they appear in the Secrets list as default secrets.

> If your project has **disabled the legacy JWT API keys**, check that `SUPABASE_SERVICE_ROLE_KEY` still holds a working key. If it doesn't, the function fails closed: it returns 500, logs `invalid configuration`, and claims nothing.

## Step 4: Deploy the function

The Supabase CLI isn't installed on this machine, so use it through npx. Run from the repo root on branch `v4-notifications`:

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref <project-ref>
npx supabase@latest functions deploy send-notifications --no-verify-jwt
```

`supabase/config.toml` also pins `verify_jwt = false`, so a later redeploy without the flag can't silently stop email.

Check the deploy output: the bundled files must be exactly `index.ts`, `lib.ts` and `templates.ts`. Tests live in `supabase/functions/_tests/`, which the CLI never deploys.

**Smoke test (PowerShell).** `Read-Host` keeps the secret out of your shell history. Close the window afterwards.

```powershell
$fn = "https://<project-ref>.supabase.co/functions/v1/send-notifications"
$secret = Read-Host "NOTIFICATIONS_CRON_SECRET"
```

1. **Without the secret:** run `curl.exe -s -o NUL -w "%{http_code}" -X POST $fn`. Expect **401**.
2. **Check the outbox first.** This run sends real email for any pending rows:
   ```sql
   select status, count(*) from notification_outbox group by 1;
   ```
3. **With the secret:** run `curl.exe -s -X POST $fn -H "x-cron-secret: $secret"`.
   - Expect `{"claimed":N,"sent":N,"retry":0,"failed":0}`.
   - If it returns 500, open Edge Functions → send-notifications → Logs. The log line names the invalid setting.

## Step 5: Vault secrets for the scheduler

In **Dashboard → Project Settings → Vault → Add new secret**, create two secrets. Use the UI rather than the SQL editor, which keeps query history.

| Name | Secret |
|---|---|
| `notifications_function_url` | `https://<project-ref>.supabase.co/functions/v1/send-notifications` |
| `notifications_cron_secret` | exactly the same value as `NOTIFICATIONS_CRON_SECRET` |

Verify, read-only: the following must return **2 rows**:

```sql
select name from vault.decrypted_secrets
where name in ('notifications_function_url', 'notifications_cron_secret');
```

## Step 6: Apply the scheduling migration

Pre-apply checks, all read-only:

```sql
select count(*) from vault.decrypted_secrets
 where name in ('notifications_function_url', 'notifications_cron_secret');     -- PASS: 2
select extname from pg_extension where extname in ('pg_cron', 'pg_net');         -- PASS: 0–2 rows (either is fine)
select to_regnamespace('cron') is null
    or not exists (select 1 from cron.job where jobname in ('send-notifications', 'purge-cron-history'));
                                                                                 -- PASS: true
```

Then run the full contents of `supabase/migrations/20260927000100_schedule_notification_sender.sql`.

Post-apply checks:

```sql
select jobname, schedule, active, username from cron.job order by 1;
-- PASS: purge-cron-history | 0 3 * * * | true | postgres  AND  send-notifications | * * * * * | true | postgres

select position('x-cron-secret' in command) > 0 as uses_header,
       command ilike '%vault.decrypted_secrets%' as reads_vault
from cron.job where jobname = 'send-notifications';
-- PASS: true | true   (the job text holds Vault lookups, never the secret itself)

select has_schema_privilege('authenticated', 'net', 'usage') as auth_net_usage,
       has_function_privilege('authenticated', 'net.http_post(text,jsonb,jsonb,jsonb,integer)', 'execute') as auth_http_post,
       has_table_privilege('authenticated', 'net.http_request_queue', 'select') as auth_queue_select,
       has_schema_privilege('anon', 'net', 'usage') as anon_net_usage;
-- PASS: false | false | false | false   (the migration revokes client access to pg_net;
--       queued requests briefly carry the x-cron-secret header)
```

After 2–3 minutes:

```sql
select status, return_message, start_time from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'send-notifications')
order by start_time desc limit 3;
-- PASS: status = succeeded

select status_code, content, created from net._http_response order by created desc limit 3;
-- PASS: status_code = 200, content like {"claimed":0,"sent":0,"retry":0,"failed":0}
```

Also confirm in Dashboard → Settings → API that `net` is **not** in the exposed schemas.

**Pause or rollback at any time:**

```sql
select cron.unschedule('send-notifications');
```

The outbox keeps filling. Re-apply the migration to resume.

## Step 7: Two-user acceptance

Use **A** and **B**, two members of the same active relationship. Each must have an inbox you can read, since that's where their email arrives. Run everything against the configuration from Steps 0–6.

| # | Action | Expected within ~2 min |
|---|---|---|
| 1 | A submits a draft expense. | B gets "הוצאה חדשה ממתינה לאישורך" (a new expense is waiting for your approval). A gets nothing. The outbox row is `sent`. |
| 2 | B opens the email link. | It lands on that expense after sign-in. Signed out, it goes to `/login`. |
| 3 | Check the email in step 1. | Hebrew, right-to-left, one button. **No** amount, merchant, reason, child or parent name, or receipt. |
| 4 | B requests changes, with a reason typed in. | A gets "התבקשו שינויים בהוצאה ששלחת" (changes were requested on an expense you submitted). **The reason does not appear in the email.** |
| 5 | A edits and resubmits. | B gets a new "needs approval" email. |
| 6 | A records a payment to B. | B gets "תשלום חדש ממתין לאישורך" (a new payment is waiting for your confirmation). The link opens the relationship's payments page. |
| 7 | A submits an expense, and B approves it **within the same minute**, before the next cron tick. | No email is sent. The row is `skipped` / `no_longer_relevant`. |
| 8 | B approves, rejects, or confirms a payment. | No email. These events aren't in Beta scope. |
| 9 | Read the outbox with the public anon key (PowerShell below). | HTTP 401 or 403 with `permission denied`. Clients can't read the outbox. |
| 10 | Call the claim RPC with the public anon key (PowerShell below). | HTTP 401 or 403 with `permission denied`. Only the sender can claim. |
| 11 | Run `select status, count(*) from notification_outbox group by 1;`. | Only `sent` and `skipped`; no `failed`. |
| 12 | In the Resend dashboard → Emails, check the steps 1, 4 and 6 emails. | `Delivered`, and not in spam in either inbox. |

For steps 9–10, the anon key is the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.local`:

```powershell
$u = "https://<project-ref>.supabase.co/rest/v1"; $k = "<anon key>"
curl.exe -s -w "  HTTP %{http_code}" "$u/notification_outbox?select=id" -H "apikey: $k" -H "Authorization: Bearer $k"                                              # step 9
curl.exe -s -w "  HTTP %{http_code}" -X POST "$u/rpc/claim_notification_batch" -H "apikey: $k" -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "{}"  # step 10
```

## Operations

```sql
-- health
select status, count(*) from notification_outbox group by 1;
select id, kind, attempts, last_error, updated_at from notification_outbox
 where status = 'failed' order by updated_at desc limit 20;
```

- **Rotate the Resend key:** create the new key, update the `RESEND_API_KEY` secret, then delete the old key in Resend.
- **Rotate the cron secret:** update the `NOTIFICATIONS_CRON_SECRET` function secret and the `notifications_cron_secret` Vault secret together. Runs in between return 401 and resume on the next minute; nothing is lost.
