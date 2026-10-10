# Stripe buy-once fulfillment done right (idempotent signed webhook + email-sent stamp + success-page recovery poller + gated download)

**When to reach for it:** a **one-time-purchase** product (a license, a download, a lifetime deal, an unlock) fulfilled by Stripe — as opposed to a subscription/cart shop. The job: take the money, mint the thing (a license key / entitlement), email it, let the customer download it, and **never leave a paying customer with nothing** even when webhooks retry, race, or the email send fails. Distinct from the shop-cart entries in [`../ecommerce-supabase-stripe/`](../ecommerce-supabase-stripe/) (recurring inventory + embedded cart checkout) — this is the "sell one artifact once, deliver it reliably" path. Pairs with [`../offline-license/ed25519-offline-license.md`](../offline-license/ed25519-offline-license.md) (what gets minted) and [`../desktop-native-app/verified-self-update.md`](../desktop-native-app/verified-self-update.md) (which reuses the gated download).

**Assumes / adapt:** Next.js App Router route handlers + Supabase + Stripe Checkout Sessions; `runtime="nodejs"`, `dynamic="force-dynamic"` on webhook & status routes (never cache a webhook or a payment-state poll).

## The recovery contract (the whole point)
A paying customer must **never** end with nothing. Any failure *after* payment returns 500 so Stripe redelivers, and redelivery is safe because every step is idempotent:

1. **Verify the Stripe signature against the RAW body first.** `await req.text()` then `stripe.webhooks.constructEvent(body, sig, secret)`. Missing sig/secret → 400; bad sig → 400. An unverified webhook is an open door to free licenses.
2. **Dedupe on the Stripe session id — but only short-circuit if the email ALSO went out.** A unique index on `stripe_checkout_session_id` dedupes the row; a separate `license_email_sent_at` timestamp tracks delivery. A row whose email is NULL means the previous attempt died *between insert and send* → fall through and **re-send**, don't early-return "deduped." This is the bug this pattern exists to prevent: paid-customer-with-a-row-but-no-email.
3. **Handle the concurrent-delivery insert race.** Two deliveries can race the insert; catch Postgres `23505` (unique violation), re-select the winner row, and continue from it (re-sending if *its* email hasn't gone out either).
4. **Stamp `license_email_sent_at` only AFTER a successful send.** If the send fails → 500 (Stripe retries → lands in the re-send branch). If the send succeeds but the stamp fails → log it; a possible duplicate email on redelivery beats claiming a delivery you didn't record.

## Success-page recovery poller (belt to the webhook's suspenders)
Never trust the post-checkout redirect alone. The success page polls `GET /api/session-status?session_id=cs_...` until the webhook-written row exists. Pinned wire contract (tests depend on these exact shapes):
```
400 {status:"invalid"}     — missing/malformed session_id (must start "cs_")
404 {status:"not_found"}    — Stripe doesn't know it, OR it's >30 days old (don't resurface a license forever)
200 {status:"unpaid"}       — session exists, not paid
200 {status:"processing"}   — paid, webhook hasn't landed yet → keep polling
200 {status:"ready", licenseKey, edition, downloadUrl}
```
The Stripe session id is an unguessable capability token, so returning the key to whoever holds it equals the email you already sent. Refuse sessions older than 30 days (a leaked/stale id shouldn't re-surface a key indefinitely).

## Gated download (public trial vs keyed) — the binary is not the secret
`GET /api/download` → 307 redirect to a **short-lived (5-min) signed Storage URL**:
- **With `?key=`:** validate the license is `active`, log the download against `license_id`.
- **No key (public trial):** same installer, same signed URL, logged with `license_id NULL`, **rate-limited per client IP** (>5/hr → 429) to bound bandwidth/egress abuse. The engine enforces trial/free tiers via signed-token licensing (see the offline-license entry), so the download is not the secret — the *license* is.
- Client IP on Vercel = **first hop of `x-forwarded-for`** (leftmost is what reached the edge), fall back to `x-real-ip`; store `null` (not a sentinel) when absent so the `inet` column cast doesn't fail. Audit-log insert is best-effort — never block the download on it.

**Cross-check against STANDARDS:** "Payments: success marker + confirming poller, never identical success/cancel URLs" and "webhook-is-fulfillment." This pattern is the concrete implementation of both.

**Source (webhook signature-gated & validated live; `cs_live_` sessions both tiers; download 307 verified):**
- `D:\SentinelBox\web\app\api\webhooks\stripe\route.ts` — the idempotent signed webhook + email-sent stamp + 23505 race handling.
- `D:\SentinelBox\web\app\api\session-status\route.ts` — the recovery poller + pinned wire contract.
- `D:\SentinelBox\web\app\api\download\route.ts` — gated download, public-trial rate limit, signed Storage URL.
- Tests: `D:\SentinelBox\web\app\api\__tests__\{webhook,session-status,download}.test.ts`.
