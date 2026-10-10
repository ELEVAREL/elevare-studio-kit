# Stripe webhook API-version drift — re-fetch, never trust the delivered payload

**A tight delta, not a payments spine.** The money spine (amount rebuilt from the DB, webhook is
fulfilment, distinct success marker + confirming poller, idempotency as a DB constraint) already
lives in [`themed-inapp-payments.md`](themed-inapp-payments.md),
[`no-service-role-order-rpc.md`](no-service-role-order-rpc.md),
`buy-once-fulfillment/stripe-buyonce-fulfillment.md` and
`multi-stream-monetization/add-paid-streams-kit.md`. This file is the **one thing none of them say**.

Harvested from `D:\HausAI\src\lib\stripe\webhook.ts`.

---

## The bug

**A webhook endpoint delivers events in the ENDPOINT's API version, which defaults to the
ACCOUNT's default version — not the version your SDK is pinned to.**

Every mapping you wrote is against your pinned shape. So the day the account default and your pin
disagree, reading `event.data.object` directly writes **NULL** into the fields that moved — with a
**green build, a clean `tsc`, and no error anywhere.**

The concrete instance: the account default was `2025-06-30.basil`, the code pinned `dahlia`. On
basil, `current_period_start/end` are still on the **subscription** and invoices still carry
`invoice.subscription`. On the pinned version those had moved onto subscription **items** and
`invoice.parent.subscription_details`. Reading the payload would have written **NULL renewal dates
for every subscriber** and nothing would have complained.

This is sharpened on any **shared Stripe account** — Elevare's `acct_REDACTED` carries live
endpoints for several products, so the account default is not any one project's to choose.

## The fix

```ts
// THE EVENT PAYLOAD IS NOT READ FOR SHAPE — the object is re-fetched.
// One extra API call per event buys immunity to an entire class of silent
// money-path bug, and the endpoint's api_version becomes a PERFORMANCE detail
// rather than a CORRECTNESS one.
let subscription = event.data.object as Stripe.Subscription;
try {
  subscription = await getStripe().subscriptions.retrieve(subscription.id);  // OUR pinned version
} catch (error) {
  log.warn("billing.webhook.refetch_failed", { subscription_id: subscription.id, error: String(error) });
  // fall back to the delivered object rather than LOSING the event — and say so in the log
}
```

Four rules that come with it:

1. **Every branch ends in the same place: re-read the authoritative object and mirror it.** Even for
   `invoice.payment_failed` — the thing that decides entitlement is the *subscription's* `status`,
   not the invoice. **An invoice tells you about one charge; entitlement is not a charge.**
2. **Write absolute values, never increments.** That makes the handler naturally idempotent:
   re-applying an event produces exactly the same row. (Delivery idempotency is still a DB `UNIQUE`
   on the event id — see the spine files.)
3. **Acknowledge everything you do not handle.** Stripe retries a non-2xx for days; returning an
   error for an event you do not care about is a self-inflicted incident.
4. **On a shared account, a subscription with no `<product>_user_id` in metadata is a clean, silent
   no-op.** Never an error status (Stripe would retry another product's event against you forever)
   and never a guess at which of your users it "probably" is.

## When to reach for it

- Any Stripe webhook, but **especially**: a shared platform account, an account whose default API
  version you did not set, an inherited integration, or an SDK upgrade that moved a field.
- The moment you write `event.data.object.<something_nested>`.

## What it costs

One extra Stripe API call per handled event (~100–200ms), and the object must be re-fetchable —
which excludes `*.deleted` events for objects that no longer exist (handle those from the delivered
payload plus a deleted flag, and mirror only the fields that matter for tombstoning).

## What it does NOT do

- It does not make the handler idempotent — rule 2 plus a DB `UNIQUE` does that.
- It does not verify the signature. Signature verification stays first, on the **raw body**.
- It does not help if your *pinned* version is itself wrong for the field you read. Pin deliberately,
  and set the endpoint's `api_version` to match anyway — this makes the mismatch harmless, not correct.
- It adds a failure mode: a Stripe outage during re-fetch. Fall back to the delivered object and log
  it loudly rather than dropping the event.

## Related

- STANDARDS.md — *"Build-green is NOT ship-green"*; `.trim()` every secret env read; never copy a
  webhook secret between projects (each product gets its own endpoint and its own signing secret).
- Memory `[[stripe-connect-blueprint]]`, `[[stripe-embedded-uimode-apiversion]]`,
  `[[orphaned-prototype-stripe-webhooks]]`.
