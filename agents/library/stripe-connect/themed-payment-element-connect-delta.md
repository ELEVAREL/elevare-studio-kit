# Themed Payment Element — the Stripe **Connect** delta

> ## ★ NOT AN ELEVARE PATH ANY MORE — 2026-09-01
>
> Elevare has no Stripe platform account and no connected accounts (permanently
> closed 2026-08-21 for aggregation; the fee is now **invoiced**, never deducted —
> [BUSINESS-PLAN.md](../../BUSINESS-PLAN.md) §2). **A studio build never needs the
> `stripeAccount` scoping below**, because the client owns their own Stripe outright
> and the charge is an ordinary single-account charge. Do not add this delta to a
> client site.
>
> **The base recipe it deltas is UNAFFECTED and remains the house staple:**
> [`ecommerce-supabase-stripe/themed-inapp-payments.md`](../ecommerce-supabase-stripe/themed-inapp-payments.md)
> (see memory [[themed-inapp-payments-staple]]). Nothing in it depended on Connect —
> go there for every themed in-app payment.
>
> **Two things here survive, and are why the file is kept:**
> 1. **The `notConnected` state-machine rule** (bottom section) generalises cleanly:
>    when a payment rail is not wired up yet, make that an **explicit phase**
>    (`loading | notConnected | error | ready`) that renders a friendly "online
>    booking isn't live yet — call/text us" panel, never a generic error. That still
>    applies whenever a client's own Stripe access or keys are not yet in place.
> 2. `loadStripe(pk, { stripeAccount })` remains **correct Stripe knowledge** for a
>    build where the *client* is the platform (a client-owned marketplace). It is
>    dead only as Elevare's own monetization path — so read it as reference, and
>    never as a step in the studio's fee model.

**This is NOT a new payment doc.** The full recipe for a brand-themed embedded Payment Element (Appearance API from `:root` tokens, PaymentIntent w/ amount-from-DB, `<Elements appearance>` → `<PaymentElement>` → `confirmPayment`, the iframe-font gotcha, dark-mode remount rule) is the studio default in [`ecommerce-supabase-stripe/themed-inapp-payments.md`](../ecommerce-supabase-stripe/themed-inapp-payments.md) — start there. This file captures the **one thing that changes when the charge is a Connect direct charge** on a *connected* account, because getting it wrong is the #1 silent failure.

*(Harvested from `D:\CoffeeBaby\src\app\quote\[token]\pay-client.tsx`.)*

## The delta: Stripe.js MUST be scoped to the connected account

When the PaymentIntent was created with `{ stripeAccount: acct }` (a direct charge — see [`quote-to-pay-connect-feesplit.md`](quote-to-pay-connect-feesplit.md)), its `client_secret` belongs to **that connected account**. The browser's Stripe.js must be told which account, or the Element silently fails to resolve the intent (no error, just a spinner that never becomes a form):

```ts
// The server returns the acct id alongside the client secret:
//   { clientSecret, stripeAccountId, publishableKey }
const stripePromise = loadStripe(data.publishableKey, {
  stripeAccount: data.stripeAccountId,   // ← REQUIRED for a connected-account intent
});
// then, unchanged from the base recipe:
<Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
  <PaymentElement options={{ layout: "tabs" }} />
</Elements>
```

- **The `publishableKey` is the PLATFORM's** publishable key (the connected account never hands over keys) — it's the `stripeAccount` option, not a different key, that scopes it.
- **Return the acct id from the payment-intent route**, don't hardcode it client-side — the client reads `NEXT_PUBLIC_..._ACCOUNT_ID` server-side and echoes it in the JSON, keeping "which account" a single server-owned fact.
- **Everything else is identical** to the base themed recipe — the Appearance object built from brand tokens, `confirmPayment({ return_url })`, the loading/error/not-connected states.

## Handle the not-yet-connected state
Before the client finishes OAuth onboarding there is no `acct` id. The payment-intent route returns `503 { notConnected: true }`; the client renders a friendly "online booking isn't live yet — call/text us" panel instead of an error. Make `notConnected` an explicit phase in the checkout state machine (`loading | notConnected | error | ready`), not a generic failure.

## Assumes / adapt
- Pairs with [`quote-to-pay-connect-feesplit.md`](quote-to-pay-connect-feesplit.md) (server side) and `[[stripe-connect-blueprint]]` (the platform/registry side).
- Everything about *theming* — cross-link, don't re-derive — is in the base [`themed-inapp-payments.md`](../ecommerce-supabase-stripe/themed-inapp-payments.md). This file is only the `stripeAccount` scoping + the `notConnected` state.
