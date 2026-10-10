# Shared themed-checkout component — one dialog every paid stream reuses

Harvested from `D:\flavornews-web` (`src/components/cities/commerce/CityCheckoutDialog.tsx`). The single reusable checkout that N paid streams point at with four props, so no stream re-implements the create → pay → confirm → resume dance.

## When to reach for it
Any app with **more than one paid flow** on the same themed-Payment-Element spine (see the `add-paid-streams-kit.md` sibling). Build this once; every stream (celebrations, boosts, subscriptions, tickets, upgrades) becomes `<Checkout createFn confirmFn payload resumeParam onSuccess/>`. It is a packaged clone of the app's proven "money spine" so the spine can't drift per-stream.

## Assumes / adapt
- A themed Stripe surface already exists: `StripeProvider` (Elements + `buildStripeAppearance()` from `:root` tokens) + a `PaymentForm` that calls `confirmPayment({ redirect:'if_required' })` and reports `onSuccess(piId)` / `onError(msg)`. This dialog wraps those; it doesn't replace them. (See `ecommerce-supabase-stripe/themed-inapp-payments.md`.)
- react-router in the sample (`useSearchParams` for redirect-resume). Adapt the resume to your router; the concept is identical.
- Edge fns follow the create/confirm contract in `add-paid-streams-kit.md` §4.

---

## The prop contract (this is the API — freeze it, don't fork per stream)

```ts
interface CityCheckoutResult {
  data: Record<string, unknown>;  // raw confirmFn result — read stream fields off this
  paymentIntentId: string;
}

interface CityCheckoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;

  createFn: string;   // edge fn that creates the PI, e.g. "create-city-onetime-payment"
  confirmFn: string;  // edge fn that confirms + fulfils, e.g. "confirm-city-onetime-payment"
  payload: Record<string, unknown>;  // body sent to createFn — MUST NOT contain an amount

  resumeParam: string;   // DISTINCT per stream: "celebration_pi" | "boost_pi" | "ticket_pi" | …
  returnPath?: string;   // path (no origin) the redirect returns to; default = current pathname

  title: string;
  description?: React.ReactNode;
  submitLabel?: string;  // default "Pay now"

  onSuccess: (result: CityCheckoutResult) => void;  // called after the payoff-beat hold
  holdMs?: number;       // payoff-beat hold before onSuccess; default 900, pass 0 to opt out
}
```

## The five things it enforces (the spine, do NOT diverge)

1. **On confirm, call `createFn` with `payload`.** The server rebuilds the amount from the pricing table; the returned `amount` is DISPLAY-ONLY. Never send/trust a client amount.
2. **Render the same themed surface** (`<StripeProvider clientSecret><PaymentForm/></StripeProvider>`) as every other flow — one appearance, one look.
3. **On PaymentForm success, call `confirmFn` with `{ paymentIntentId }`.** `confirmFn` re-verifies `pi.status==='succeeded'`, is idempotent, provisions the effect, writes the ledger, emails.
4. **Redirect-resume with a DISTINCT marker per stream.** Bank/3DS methods return to the page with `?<resumeParam>=<pi>`; on mount the dialog detects it, resumes confirm, then **deletes the marker** (so a refresh can't re-run confirm). Two flows open on one page (a celebration + a boost) with the same marker would collide on return — hence each stream MUST pass its own `resumeParam`.
5. **Errors carry a machine `code`;** the dialog switches on presence of `data`, never on message copy. Callers that must branch on a specific case read `code` off the result.

## Two guards worth copying exactly
- **A `confirming` ref serializes the confirm call** so a redirect-resume and a manual PaymentForm success can't both fire it (server is idempotent too, but this dodges the double round-trip).
- **State fully resets on close** (`phase→create`, clear `clientSecret`/`paymentIntentId`), so the next open of a DIFFERENT payload starts a fresh PaymentIntent instead of reusing a stale one.

## The payoff beat (craft, not decoration)
On success the dialog shows a resolved confirmation state and **HOLDS ~900ms** before calling `onSuccess`, so the climax lands instead of flashing and vanishing. Pass `holdMs={0}` when the CALLER owns the payoff (e.g. a composer that reveals its own finished keepsake, then routes to a receipt) — see `keepsake-composer-and-paid-prestige.md`.

## Performance note (copy this)
Lazy-load the Stripe surface so the dialog can sit inside a stream chunk WITHOUT dragging `@stripe/*` along — the SDK chunk is fetched on real checkout-intent only:

```tsx
const StripeProvider = lazy(() => import("@/components/stripe/StripeProvider").then(m => ({ default: m.StripeProvider })));
const PaymentForm    = lazy(() => import("@/components/stripe/PaymentForm").then(m => ({ default: m.PaymentForm })));
```

## Caller pattern — freeze the payload while open
`CityCheckoutDialog` re-reads `payload` fresh on each open; the caller must keep it STABLE during the payment dance (a re-created object mid-flow would re-mint the PI). Freeze it with a `useMemo` keyed on the open flag:

```tsx
const payload = useMemo(() => ({
  stream: "celebration", city_slug, celebration: {…}, customer_email,
}), [payOpen]);   // eslint-disable-line react-hooks/exhaustive-deps
```

## Two example wirings

```tsx
// One-time (celebration): read data.orderId / data.receiptToken on success
<CityCheckoutDialog
  createFn="create-city-onetime-payment" confirmFn="confirm-city-onetime-payment"
  resumeParam="celebration_pi" title="Publish this celebration"
  payload={{ stream:"celebration", city_slug, celebration:{…}, customer_email }}
  onSuccess={({ data }) => routeToReceipt(data.receiptToken)} />

// Subscription (directory/sponsor/category): same component, subscription pair.
// Confirm result carries subscriptionId + sourceId.
<CityCheckoutDialog
  createFn="create-city-business-subscription" confirmFn="confirm-city-business-subscription"
  resumeParam="directory_pi" title="List your business"
  payload={{ stream:"directory_featured", city_slug, business_name, owner_email }}
  onSuccess={({ data }) => {/* data.sourceId, data.subscriptionId */}} />
```

## Source reference
`D:\flavornews-web\src\components\cities\commerce\CityCheckoutDialog.tsx` (full component) + `…\commerce\README.md` (the pinned prop contract the whole build coded against).
