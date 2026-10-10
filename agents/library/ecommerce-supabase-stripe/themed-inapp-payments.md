# Theme-matched in-app payments (studio default)

**What it is.** The studio's **default way to take a payment**: it happens **in-app** (never an off-site redirect) and it **looks like the rest of the site**, not like generic Stripe. The crown jewel is a `buildStripeAppearance()` that reads the site's own design tokens (CSS custom properties) at runtime and hands Stripe an Appearance object — so the card form inherits your brand color, radius, borders, and focus ring **with zero hardcoded hexes**. Drop it into any project and the payment fields match automatically.

**When to reach for it.** Every project that charges money, unless the user explicitly asks for hosted redirect. This is the staple — start here.

> **Charging a Stripe Connect *connected* account?** Everything here still applies, but you must additionally scope Stripe.js to the connected account (`loadStripe(pk, { stripeAccount })`) or the Element spins forever — see the one-page [`../stripe-connect/themed-payment-element-connect-delta.md`](../stripe-connect/themed-payment-element-connect-delta.md).

## Pick the surface (both are in-app; they differ on control vs. convenience)

| | **Payment Element** *(studio default for brand match)* | **Embedded Checkout** *(convenience alt)* |
|---|---|---|
| Theming | **Full** — Appearance API (variables + CSS rules) → matches your tokens exactly | Limited — Dashboard → Branding only (one brand color, logo, font preset) |
| You build | the form + PaymentIntent + confirm | almost nothing (`<EmbeddedCheckout/>`) |
| Stripe auto-handles | wallets (Apple/Google Pay) via `automatic_payment_methods` | wallets **+ shipping address + tax + promo codes** |
| Reach for it when | brand precision matters (the usual answer) | you want Stripe to run shipping/tax/methods with least code and near-brand is fine |

Mechanics for the convenience alt live in [`embedded-stripe-checkout-nextjs.md`](embedded-stripe-checkout-nextjs.md). The rest of this file is the **default: themed Payment Element**.

## 1. The token → Appearance bridge (the reusable core)

```ts
// lib/stripe-appearance.ts — reads live :root design tokens, maps to Stripe Appearance.
// No hardcoded brand colors: it adapts to whatever site it's dropped into.
import type { Appearance } from "@stripe/stripe-js";

const tok = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

export function buildStripeAppearance(): Appearance {
  return {
    theme: "stripe", // neutral base, then override everything below
    variables: {
      colorPrimary:       tok("--color-primary", "#635bff"),
      colorBackground:    tok("--color-surface", "#ffffff"),
      colorText:          tok("--color-ink", "#1a1a1a"),
      colorTextSecondary: tok("--color-muted", "#6b7280"),
      colorDanger:        tok("--color-danger", "#9b3b3b"),
      fontFamily:         tok("--font-sans", "system-ui, sans-serif"),
      borderRadius:       tok("--radius-md", "10px"),
      spacingUnit:        "4px",
      fontSizeBase:       "15px",
    },
    rules: {
      ".Input":            { border: `1px solid ${tok("--color-border-strong", "#d1d5db")}`, boxShadow: "none", padding: "12px 14px" },
      ".Input:focus":      { border: `1px solid ${tok("--color-primary", "#635bff")}`, boxShadow: `0 0 0 3px ${tok("--color-primary-tint", "#ecebff")}`, outline: "none" },
      ".Label":            { color: tok("--color-muted", "#6b7280"), fontWeight: "600", fontSize: "13px" },
      ".Tab, .Block":      { border: `1px solid ${tok("--color-border", "#e5e7eb")}` },
      ".Tab--selected":    { borderColor: tok("--color-primary", "#635bff"), color: tok("--color-primary-ink", "#4b45c6") },
      ".Error":            { color: tok("--color-danger", "#9b3b3b") },
    },
  };
}
```

Swap nothing between projects — the token **names** are the studio convention (see `tailwind-v4-warm-brand-tokens.md`); only the fallbacks are cosmetic.

> **Dark / inverted themes (important):** the runtime token-reader above assumes a *light* semantic map (`--color-ink` = text, a `--color-surface` = background). Projects whose tokens invert that — e.g. a dark theme where `--color-ink` is the **page background** and a cream token is the text — must map explicitly instead of relying on the generic names, or the card text comes out the same color as the field. Ship a **static, correctly-mapped `stripeAppearance` object** (still built from the project's real token values, just wired by hand) + a `stripeFonts` array. Concrete reference: **`D:\styledbymyiah\lib\stripe-appearance.ts`** (dark plum-rose theme: `--color-ink` bg → `.Input` background, `--color-cream` → `colorText`, rose accent → `colorPrimary`/focus) consumed by `components/booking/deposit-payment-form.tsx`. This is the first shipped themed-Payment-Element build and the cleanest copy source for a dark-theme project.

## 2. Server — PaymentIntent with the amount rebuilt from the DB

```ts
// POST /api/pay/intent  → { clientSecret }
export const runtime = "nodejs";
const amount = await computeAmountFromDB(body);   // NEVER trust a client-sent price
const intent = await stripe.paymentIntents.create({
  amount, currency: "usd",
  automatic_payment_methods: { enabled: true },   // cards + wallets + local methods, no per-method wiring
  metadata,                                        // compact ledger for the webhook (chunk if >500 chars)
});
return NextResponse.json({ clientSecret: intent.client_secret });
```

## 3. Client — mount Elements with the themed appearance

```tsx
"use client";
import { Elements, PaymentElement, AddressElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { buildStripeAppearance } from "@/lib/stripe-appearance";

const appearance = useMemo(buildStripeAppearance, []);
// Brand fonts must be passed explicitly — the Element renders in an iframe that
// can't see the page's @font-face. Omit for a system font.
const fonts = [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" }];

{clientSecret && (
  <Elements stripe={stripePromise} options={{ clientSecret, appearance, fonts, loader: "auto" }}>
    <PayForm />
  </Elements>
)}

function PayForm() {
  const stripe = useStripe(); const elements = useElements();
  async function pay() {
    const { error } = await stripe!.confirmPayment({
      elements,
      confirmParams: { return_url: `${location.origin}/checkout/success` },
      redirect: "if_required",           // cards resolve inline; only redirect-methods leave
    });
    if (error) setMsg(error.message);     // card/validation errors surface here, themed via .Error
  }
  return (<>
    <PaymentElement />
    <AddressElement options={{ mode: "shipping" }} />   {/* only if you collect shipping */}
    <button className="btn btn-primary w-full" onClick={pay}>Pay</button>
  </>);
}
```

## Assumes / adapt
- **Payment Element is the default** *because* "match the theme" was the ask — it's the only surface with the full Appearance API. Reach for Embedded Checkout only when you'd rather Stripe run shipping/tax/methods and near-brand is acceptable.
- **Appearance is set at `<Elements>` init and can't be mutated live.** For dark mode / theme toggle, recompute `buildStripeAppearance()` and **remount** `<Elements>` (key it by the active theme).
- **Fonts:** pass the `fonts` option or the iframe falls back to a system font — the page's `@font-face` is invisible inside it. Custom self-hosted font → `CustomFontSource`.
- **Wallets:** `automatic_payment_methods` surfaces Apple/Google Pay automatically, but **Apple Pay needs domain registration** (Stripe Dashboard → Payment method domains) or it silently won't show.
- **The spine is unchanged from the rest of commerce:** amount rebuilt from the DB (client trusted only for identity+qty), **webhook is fulfillment** (`payment_intent.succeeded`), success page has its own marker and polls webhook-written state — never fulfill on `return_url`. See [`no-service-role-order-rpc.md`](no-service-role-order-rpc.md) and the STANDARDS payments rule.
- Ship `@stripe/stripe-js` + `@stripe/react-stripe-js`; lazy-load the Stripe promise (don't static-import into a hot route — STANDARDS hot-route hygiene).
- **If Stripe keys are absent**, the intent route returns 503 and the page shows "payments aren't connected yet" — same graceful-degrade contract as the embedded flow, so a site can ship before the owner adds their keys.
