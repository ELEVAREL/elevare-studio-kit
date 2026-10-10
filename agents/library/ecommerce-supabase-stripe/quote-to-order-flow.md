# Quote-to-order flow (request → owner prices → pay link → paid order)

**What it is.** A custom/made-to-order pipeline: a customer submits a request, the owner reviews and prices it in the dashboard, the app emails a **pay link**, the customer opens a **token-gated public quote page**, pays via embedded checkout, and the webhook turns the paid quote into a real order. No account needed for the customer.

**When to reach for it.** Any "we quote it, then you pay" business: commissions, custom fabrication, bespoke services, deposits, invoices, "request a proposal → pay." Bolts onto the same Supabase + embedded-Stripe stack as the standard cart.

> **Which variant?** This doc is the **platform-owns-the-money** flavor — the site's own Stripe, a self-hosted webhook, `place_quote_order`. If **the studio built the site but the money belongs to a *client* and you take a platform %** (a direct charge on their connected account + `application_fee_amount`, settled by the central Connect router), reach for [`../stripe-connect/quote-to-pay-connect-feesplit.md`](../stripe-connect/quote-to-pay-connect-feesplit.md) instead — same request→price→pay shape, different money routing.

## The flow

1. **Request** — public form inserts a `custom_requests` row (`name, email, category, message, status='new', quote_cents=null, token=…`). Token = unguessable random (`gen_random_bytes`), used as the public URL key.
2. **Owner prices it** — dashboard sets `quote_cents`, optional `quote_note`, `status='quoted'`; app sends the quote email (`sendQuote({ payUrl: /quote/<token> })`).
3. **Token-gated quote page** — `/quote/[token]` (server component, `robots: noindex`) reads the quote via a `SECURITY DEFINER` `get_quote_by_token(p_token)` RPC (bare anon client, no secret) and renders one of three states: **not priced yet** ("your request is in"), **priced** (amount + note + pay button), **paid** (thank-you + order number).
4. **Pay** — `POST /api/quote-checkout` re-reads the quote by token server-side (never trust a client price), rejects if already paid / not priced, creates an embedded session with `metadata: { quote_token }`, returns `{ clientSecret }`.
5. **Webhook → order** — on `checkout.session.completed`, if `session.metadata.quote_token` is present, call `place_quote_order(p_secret, p_token, p_payload)` (SECURITY DEFINER, secret-gated, idempotent on `stripe_session_id`) which creates the order from the quote and flips it to paid.

```ts
// webhook branch
const quoteToken = session.metadata?.quote_token;
if (quoteToken) {
  await rpc.rpc("place_quote_order", { p_secret: rpcSecret, p_token: quoteToken, p_payload });
  return;
}
```

```ts
// /api/quote-checkout — server is the price authority
const { data: quote } = await rpc.rpc("get_quote_by_token", { p_token: token });
if (!quote) return 404;
if (quote.paid) return 409 "already paid";
if (!quote.quote_cents || quote.quote_cents <= 0) return 409 "not ready to pay";
// build a single line_item from quote.quote_cents; return_url `/quote/<token>?paid=1`
```

## Assumes / adapt
- **Token, not id, in the public URL.** The quote page is unauthenticated — key it by an unguessable random token (`get_quote_by_token`), never a sequential id (that's an enumerable PII leak).
- **Price authority stays server-side.** `/api/quote-checkout` re-reads `quote_cents` from the DB by token; the pay page sends only the token. Same discipline as the cart checkout.
- **Reuse the order RPC pattern.** `place_quote_order` is the same secret-gated, idempotent `SECURITY DEFINER` shape as `place_order` (see `no-service-role-order-rpc.md`) — just sourced from a quote row instead of a cart payload.
- **Three UI states are load-bearing** — don't collapse "requested but not yet priced" into "priced"; the customer keeps the same link the whole time.
- Emails (`sendQuote`, request receipt, owner alert) reuse the transactional shell; keep the pay-button link copy-pasteable as plain text too.
