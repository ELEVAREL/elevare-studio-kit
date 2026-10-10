# Processor-agnostic payments adapter (swap Stripe ↔ any processor via one env var)

**When to reach for it:** any app that takes payments where the processor **might change** — you're launching on Stripe but the merchant category is a Stripe gray area (firearms accessories, CBD, gambling-adjacent), or you want to ship "cash/manual only" today and light up cards later without touching pages or the DB. Instead of littering routes with `stripe.checkout.sessions.create(...)`, you code every page against a tiny `PaymentProvider` interface and pick the concrete adapter from `PAYMENT_PROVIDER`. Adding a new processor (Authorize.Net, NMI, PaymentCloud, Square) = **one new file + flip an env var**. No page, route, or database change.

**Assumes / adapt:**
- **Hosted-checkout model.** The interface assumes the provider hands back a **redirect URL** (Stripe Checkout Sessions, Square hosted checkout, etc.) so the card form stays off your domain and out of PCI scope. If you need an *embedded* element (Stripe Payment Element / PaymentIntents) the interface still fits — `createCheckout` returns a client secret instead of a URL and the pay page branches on provider — but adapt the return type.
- **Three methods carry the whole contract:** `isConfigured()` (does this provider have the env to actually charge?), `createCheckout(order, {successUrl, cancelUrl})` → `{url, providerRef}`, and `parseWebhook(rawBody, signature)` → a normalized `SettlementEvent | null`. Everything processor-specific (Stripe's `checkout.session.completed`, its signature verification) lives **inside** the adapter; the webhook route just calls `parseWebhook` and gets back `{orderId, providerRef, amountTotalCents}` or null.
- **`getPaymentProvider()` dynamic-imports the chosen adapter** — the Stripe SDK is only loaded when `PAYMENT_PROVIDER=stripe`, so a manual/cash deployment ships zero Stripe code on the hot path. Cache the instance.
- **`cardPaymentsEnabled()` drives the UI** — the pay page calls it to decide whether "Pay by card" is live or the order shows "ask the owner". The default `manual` adapter returns `isConfigured() === false`, so a freshly-deployed app is fully functional (sales tracked, receipts issued) with cards simply dark until keys land. This is the "ship now, connect the processor later" seam.
- **The route reads the normalized event, then hands off** — settlement itself (verifying amount, marking paid) belongs to your DB layer, not the adapter. Pairs with [`service-role-free-supabase-security.md`](service-role-free-supabase-security.md)'s secret-gated `settle_order` RPC.
- **Reference:** `D:\precisionaim\src\lib\payments\` — `index.ts` (interface + factory), `manual.ts` (no-op default), `stripe.ts` (Checkout Sessions adapter). Call sites: `src/app/api/checkout/route.ts`, `src/app/api/webhook/route.ts`. `MAINTAINER.md` documents adding an FFL-friendly processor with zero page/DB changes.

## The interface + factory (`src/lib/payments/index.ts`)

```ts
export interface CheckoutResult { url: string; providerRef: string; }
export interface SettlementEvent { orderId: string; providerRef: string; amountTotalCents: number; }

export interface PaymentProvider {
  readonly id: string;
  isConfigured(): boolean;                                   // has the env to actually charge?
  createCheckout(order: PublicOrder, opts: { successUrl: string; cancelUrl: string }): Promise<CheckoutResult>;
  parseWebhook(rawBody: string, signature: string | null): Promise<SettlementEvent | null>;  // verify + normalize
}

let cached: PaymentProvider | null = null;

export async function getPaymentProvider(): Promise<PaymentProvider> {
  if (cached) return cached;
  const which = (process.env.PAYMENT_PROVIDER || "manual").toLowerCase();
  if (which === "stripe") { const { StripeProvider } = await import("./stripe"); cached = new StripeProvider(); }
  else                    { const { ManualProvider } = await import("./manual"); cached = new ManualProvider(); }
  return cached;                                             // dynamic import: only load the SDK you use
}

/** UI/route guard — true only when a real processor is wired AND configured. */
export async function cardPaymentsEnabled(): Promise<boolean> {
  const p = await getPaymentProvider();
  return p.id !== "manual" && p.isConfigured();
}
```

## The default (`manual.ts`) — ship without a processor

```ts
export class ManualProvider implements PaymentProvider {
  readonly id = "manual";
  isConfigured() { return false; }                          // cards stay dark; sales still tracked/receipted
  async createCheckout() { throw new Error("Card payments are not enabled yet."); }
  async parseWebhook() { return null; }
}
```

## A concrete adapter (`stripe.ts`) — all processor detail contained here

```ts
export class StripeProvider implements PaymentProvider {
  readonly id = "stripe";
  private client = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  isConfigured() { return Boolean(process.env.STRIPE_SECRET_KEY); }

  async createCheckout(order, opts) {
    const session = await this.client!.checkout.sessions.create({
      mode: "payment", success_url: opts.successUrl, cancel_url: opts.cancelUrl,
      client_reference_id: order.id, metadata: { order_id: order.id },
      line_items: order.items.map((it) => ({ quantity: it.quantity, price_data: {
        currency: order.currency, unit_amount: it.unit_price_cents, product_data: { name: it.name } } })),
    });
    return { url: session.url!, providerRef: session.id };
  }

  async parseWebhook(rawBody, signature) {                  // signature verification lives INSIDE the adapter
    const event = this.client!.webhooks.constructEvent(rawBody, signature!, process.env.STRIPE_WEBHOOK_SECRET!);
    if (event.type !== "checkout.session.completed") return null;
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.payment_status !== "paid") return null;
    const orderId = s.client_reference_id || s.metadata?.order_id;
    return orderId ? { orderId, providerRef: s.id, amountTotalCents: s.amount_total ?? 0 } : null;
  }
}
```

## The route only knows the interface

```ts
// checkout route — guard on the abstraction, never on "is Stripe set up"
if (!(await cardPaymentsEnabled())) return json({ error: "Card payments are not enabled." }, 400);
const { url } = await (await getPaymentProvider()).createCheckout(order, { successUrl, cancelUrl });

// webhook route — normalized event or null, no Stripe types leak out here
const settlement = await (await getPaymentProvider()).parseWebhook(rawBody, signature);
if (!settlement) return json({ received: true });          // ack non-paid events so the processor stops retrying
// ...hand settlement.{orderId, amountTotalCents} to your amount-verified settle step
```

**To add a new processor:** create `src/lib/payments/<name>.ts` implementing the three methods, add one branch to `getPaymentProvider()`, set `PAYMENT_PROVIDER=<name>` (+ its keys). Done — pages and DB are untouched because they only ever saw the interface.
