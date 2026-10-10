# Embedded (in-app) Stripe Checkout on Next.js 16

**What it is.** Stripe Checkout that renders **inside your own page** (never redirects off-site) via `ui_mode: "embedded"`. Server creates the session and returns `{ clientSecret }`; the client mounts `<EmbeddedCheckout>`. Includes the three gotchas that bite every time: server-side price integrity, metadata chunking for the 500-char cap, and the SDK-types gap cast.

**When to reach for it.** Any Next.js app taking a one-off payment where you want the customer to stay on your domain (branded, no jarring redirect) — shops, quote/pay pages, deposits. Prefer over the hosted-redirect flow when brand continuity matters.

## Server — `POST /api/checkout` returns a client secret

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1) REBUILD every line item from the DB. The client body is trusted ONLY for
//    which product/variant + qty — never for price or name.
//    - fetch products/variants by id, status='active' (public RLS)
//    - variant.price_cents overrides product.price_cents only when set
//    - clamp qty (1..99), collapse duplicate product:variant keys
//    - reject sold-out tracked inventory; cap qty at stock
const lineItems = items.map(i => ({
  quantity: i.qty,
  price_data: { currency: "usd", unit_amount: i.unit_price_cents,
    product_data: { name: i.name, ...(i.sku ? { metadata: { sku: i.sku } } : {}) } },
}));

// 2) ui_mode:"embedded" + return_url + client_secret are stable Stripe features
//    but missing from this SDK version's static types → cast params & response.
const params = {
  ui_mode: "embedded",
  mode: "payment",
  line_items: lineItems,
  shipping_options: shippingOptions,
  shipping_address_collection: { allowed_countries: ["US"] },
  phone_number_collection: { enabled: true },
  custom_fields: [{ key: "note", type: "text", optional: true,
    label: { type: "custom", custom: "Personalization or note (optional)" } }],
  return_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
  metadata,  // see chunking below
} as unknown as Stripe.Checkout.SessionCreateParams;

const session = await stripe.checkout.sessions.create(params);
const clientSecret = (session as { client_secret?: string | null }).client_secret;
return NextResponse.json({ clientSecret });
```

### Metadata chunking (Stripe caps each metadata VALUE at 500 chars)
Pass the compact item ledger to the webhook via metadata, but split it if long — otherwise the create call throws on a big cart:

```ts
const itemsJson = JSON.stringify(items.map(i => ({ product_id, variant_id, name, sku, unit_price_cents, qty })));
const metadata: Record<string,string> = { subtotal_cents: String(subtotal), shipping_cents: String(shipping) };
if (itemsJson.length <= 500) metadata.items = itemsJson;
else {
  const CHUNK = 480; let idx = 0;
  for (let p = 0; p < itemsJson.length; p += CHUNK) metadata[`items_${idx++}`] = itemsJson.slice(p, p + CHUNK);
  metadata.items_chunks = String(idx);
}
// webhook reassembles: items ?? concat(items_0..items_{chunks-1})
```

## Client — mount the embedded checkout

```tsx
"use client";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

const startedRef = useRef(false);       // fire the POST once
useEffect(() => {
  if (!ready || startedRef.current || lines.length === 0) return;
  startedRef.current = true;
  const snapshot = lines;               // point-in-time cart snapshot
  let cancelled = false;
  (async () => {
    const res = await fetch("/api/checkout", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines: snapshot }) });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) throw new Error(data.error);   // Stripe not connected
    if (!res.ok || !data.clientSecret) throw new Error(data.error || "Couldn't start checkout.");
    if (!cancelled) setClientSecret(data.clientSecret);
  })().catch(e => !cancelled && setError(e.message));
  return () => { cancelled = true; };
}, [ready]);

{clientSecret && stripePromise && (
  <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
    <EmbeddedCheckout />
  </EmbeddedCheckoutProvider>
)}
```

## Assumes / adapt
- **Price integrity is non-negotiable.** Rebuild names + prices from the DB server-side; the client is trusted only for identity + quantity. A client-sent price is a discount-yourself exploit.
- **`return_url` is not fulfillment.** Never fulfill on the return redirect — that's a double-fulfill race. The webhook is the source of truth (see `no-service-role-order-rpc.md`); the success page just polls server state written by the webhook. Give success its own marker (`?session_id=…`), don't reuse the cancel URL.
- **The `as unknown as …` cast** is needed while the installed `stripe` SDK's static types lag the embedded-mode fields. Re-check on SDK upgrade; drop the cast when types catch up.
- `startedRef` + a `cancelled` flag stop React 18/19 double-effect from creating two sessions.
- Ship `@stripe/react-stripe-js` + `@stripe/stripe-js`; lazy-load the Stripe promise (don't static-import it into a hot route).
- Adjust `allowed_countries`, shipping options, and `custom_fields` per shop.
