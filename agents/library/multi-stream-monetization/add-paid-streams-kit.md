# Add-paid-streams kit — a multi-stream monetization spine on Supabase + Stripe (regular mode)

Harvested from `D:\flavornews-web` (Good News USA "Cities revenue network" — an existing Vite/React/Supabase/Stripe app that grew from ONE paid flow into **eight** paid streams: directory listings, category sponsorships, resident celebrations, post boosts, featured events, event tickets, city-claim, print-lead — all landing in the platform account, no Connect split).

## When to reach for it
When an app already takes money one way and you must **layer several MORE paid things onto it** without re-inventing checkout each time, and without a marketplace fee-split (regular mode — all funds land in your own Stripe account). Directory + sponsorships + one-time buys + subscriptions + tickets, one app, one ledger, one themed checkout. This is the "how do I add N monetization streams cleanly" kit.

- **Fee-split / money-belongs-to-a-client?** → `stripe-connect/` instead.
- **A single shop / cart?** → `ecommerce-supabase-stripe/` instead.
- This kit's edge: **many disjoint paid streams share ONE spine** — one pricing table, one ledger, one checkout component, one webhook — added incrementally.

## Assumes / adapt
- Supabase + Stripe (regular mode) + a themed Payment Element already proven once in the app (the "money spine" — see `ecommerce-supabase-stripe/themed-inapp-payments.md`). This kit is what you clone that ONE proven flow into for every new stream.
- React SPA in the sample (Vite + react-router), but the five load-bearing parts are stack-agnostic.
- Service-role edge functions do the privileged writes; every visitor already has an `auth.uid()` (anon sign-in) so RLS "authenticated" covers guests. Adapt if you use no-service-role posture (`supabase-nextjs-pwa/service-role-free-supabase-security.md`).

---

## The five load-bearing parts (this is the whole kit)

### 1. DB-driven pricing table — one row per priced thing, never a hardcoded amount

`city_pricing`: `key` UNIQUE, `amount_cents int`, `is_recurring bool`, `interval text`, `description text`, **`stripe_price_id text`** (recurring keys read it at runtime). Public SELECT, admin-manage.

Rules that make it work across many streams:
- **Every stream reads its price from this table by a canonical string key** — the frontend for display, the edge fn for the real charge. A body-supplied amount is never trusted.
- **Recurring vs one-time split:** one-time streams charge a PaymentIntent whose amount = `amount_cents` straight from the table (no pre-made Stripe Price needed — pricing stays 100% DB-driven). Recurring streams need BOTH a row (display) AND a real Stripe Price whose id is stored in `stripe_price_id` — the subscription fn reads that column and fails clearly (`code:"PRICE_NOT_CONFIGURED"`) if null.
- **A rate key is not a money key.** `event_ticket_fee_pct.amount_cents = 500` means **5.00%**, not $5. Mark such keys explicitly and format them as a percent — a caller must not render "$5.00" for a 5% fee. (See the `RATE_KEYS` set in the pricing hook below.)
- **Placeholder-seed then admin-edits.** Ship the whole build against placeholder amounts an admin edits in a pricing editor before go-live. The build never blocks on final numbers.
- **Adding a new priced CLASS = extend every CHECK constraint** it must satisfy in the SAME migration (the ledger `source` enum, any category/fulfillment CHECK, the subscription plan CHECK) — or the insert silently fails the constraint.

**The single frontend read path** (one hook, cache-per-mount, one formatting convention — the whole network shares it):

```ts
// usePricing() — the ONLY place the pricing table is read on the client.
const RATE_KEYS = new Set(["event_ticket_fee_pct"]);   // amount_cents is a RATE, not money

function formatRow(row) {
  if (RATE_KEYS.has(row.key)) {
    const pct = row.amount_cents / 100;                 // 500 -> 5
    return (Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, "")) + "%";
  }
  return fmt(row.amount_cents, { cents: true });        // "$19.00"
}
// fetch the small whole table once, index by key; expose get(key) / formatted(key, fallback="—").
// A MISSING key is NOT an error (admin hasn't seeded it yet) -> show a disabled/"coming soon"
// affordance, never a crash. Only a real network/RLS failure sets `error`.
```

### 2. Unified orders ledger — one row per paid transaction, idempotent on `(stripe_object_id, source)`

`city_orders` is written **service-role only** (confirm fn and/or webhook), one row per paid transaction across every stream:

```
city_id            uuid  NOT NULL          -- attributes money to a tenant
source             enum  (city_claim | directory | sponsored_category | celebration |
                          boost | event_ticket | event_featured | print_upsell)
source_id          uuid                    -- the originating row's id (per-source map below)
amount_cents       int                     -- server-computed
platform_fee_cents int                     -- tickets only; 0 elsewhere (bookkeeping in regular mode)
currency           text  default 'usd'
stripe_object_id   text                    -- pi_... | sub_... | in_...
stripe_object_type text                    -- 'payment_intent' | 'subscription' | 'invoice'
buyer_email        text
status             enum  (pending|paid|refunded|partially_refunded|failed|canceled)
description        text
```

- **Idempotency is the whole point:** a **partial-unique index on `(stripe_object_id, source)`** + `ON CONFLICT DO NOTHING`. A confirm call and a webhook double-fire cannot double-count. `source` is part of the key so the same PI could (rarely) back two ledger rows of different sources without a false collision.
- **`source ↔ source_id` map** is fixed and documented once: `directory→city_businesses.id`, `sponsored_category→sponsored_categories.id`, `celebration→celebrations.id`, `boost→post_boosts.id`, `event_featured→city_events.id`, `event_ticket→event_orders.id`, `city_claim→cities.id`.
- **Resist column sprawl.** Keep it to `source`/`source_id`/`stripe_object_id`/`stripe_object_type` — do NOT add per-stream columns (`order_type`, `entity_table`, `stripe_payment_intent_id`, `stripe_subscription_id`, `metadata`, `is_recurring`, `paid_at`). One generic shape serves every stream; per-stream detail lives on the source row.
- Powers reporting via one RPC `get_city_revenue_summary(p_city_id)` (owner/admin-gated, SECURITY DEFINER) → MTD + all-time grouped by `source` + counts, on **calendar-month boundaries in the tenant timezone**, not rolling UTC. The admin overview just SELECTs `status='paid'` rows and aggregates client-side, labeling each `source`.

### 3. ONE shared themed checkout component every stream reuses

A single dialog (`CityCheckoutDialog`) driven by four props — `createFn`, `confirmFn`, `payload`, `resumeParam` — so a stream NEVER re-implements the create → pay → confirm → resume dance. See the companion file `shared-checkout-component.md` for the full component + prop contract. The one-line version:

```tsx
<CityCheckoutDialog
  createFn="create-city-onetime-payment"   // edge fn that mints the PI (rebuilds amount from pricing)
  confirmFn="confirm-city-onetime-payment" // edge fn that verifies + fulfils + writes the ledger
  resumeParam="celebration_pi"             // DISTINCT per stream (redirect-resume collision guard)
  payload={{ stream:"celebration", city_slug, celebration:{…}, customer_email }}  // NO amount, ever
  onSuccess={({ data }) => {/* read data.receiptToken / data.subscriptionId / … */}}
/>
```

### 4. Two edge-fn shapes cover every stream — one-time and subscription

All new functions: `verify_jwt=false`, copy the app's shared `corsHeaders` + `[FN] step` logger, **`.trim()` every secret env read**, never `stripe.x.create(params, {})` with an empty 2nd arg, rate-limit create/confirm by client IP, return `{ error, code }` (frontends switch on `code`, never message text).

**One-time (celebration / boost / featured):** `create-*-onetime-payment` / `confirm-*`.
- **create:** validate → resolve the tenant → validate the target row belongs to the tenant → pick the pricing key **server-side** (e.g. memorial vs standard, social vs plain) → read `amount_cents` → **create NO DB row yet** — carry every field in PI metadata (`purchase_type`, `stream`, ids, `city_pricing_key`, a compacted celebration JSON capped at Stripe's 500-char/value limit) → return `{ clientSecret, paymentIntentId, amount }` (amount is display-only).
- **confirm** `{ paymentIntentId }`: PI must be `succeeded` → idempotent on the ledger's `(stripe_object_id, source)` → NOW create the effect (insert the celebration as `pending_review`, activate the boost with `starts_at`/`expires_at`, flip the event `is_featured`) → write the `city_orders` row → email buyer + platform → return `{ success, orderId(source_id), stream, … }`. **No DB row exists until the money is real** — a closed tab leaves zero orphans.

**Subscription (directory-featured / directory-sponsor / sponsored-category):** `create-*-subscription` / `confirm-*`.
- **create:** validate → for exclusivity streams reject if the slot is taken (`code:"CATEGORY_TAKEN"`) → find/create the Stripe customer by email → **pre-insert/reserve a pending row** (`status='pending'`, tier set) so the entity exists before payment → create a PI with `setup_future_usage:"off_session"` + metadata → return `{ clientSecret, paymentIntentId, amount, sourceId }`.
- **confirm** `{ paymentIntentId }`: PI `succeeded` → idempotent (row already has a subscription id → `{ alreadyProcessed:true }`) → create the subscription from `city_pricing.stripe_price_id` (fail `PRICE_NOT_CONFIGURED` if null), with a trial to bridge the already-charged first period → activate the row → write the ledger (`stripe_object_type:'subscription'`) → email → return `{ success, sourceId, subscriptionId }`.

The **asymmetry is the rule**: one-time = PI-metadata-then-confirm (no row until paid); subscription = pre-reserve a pending row (the entity must exist to attach billing to). Don't mix them.

### 5. Webhook is the fulfillment ship-of-truth (handler-module protocol)

Extend the existing `stripe-webhook` to dispatch on `metadata.purchase_type`, so fulfillment is **guaranteed server-side even if the client confirm never runs** (closed tab, failed bank redirect). This is the fix for the classic "customer paid but the entity is still `pending`" bug. Also handle `invoice.payment_succeeded` (subscription renewals → write ledger + billing-events) and `charge.refunded` (→ `city_orders.status='refunded'`). Because one webhook file is touched by every stream, each stream ships its logic as a **new handler module** and one integration agent wires the imports into the single switch — see `parallel-monetization-wave.md` §webhook-protocol.

---

## The non-negotiables this kit bakes in (all from STANDARDS)
- Amount **always** rebuilt server-side from the pricing table; the response amount is display-only.
- Webhook is fulfillment; success has its **own** marker (distinct `resumeParam` per stream) + a confirming step; never a shared success/cancel URL.
- Ledger idempotent on `(stripe_object_id, source)`.
- Edge-fn errors carry a machine `code`; UI branches on `code`, never message copy.
- `.trim()` every secret env read; never `create(params, {})`; rate-limit unauthenticated create/confirm.
- Adding a priced CLASS extends every gating CHECK in the same migration.
- Money dashboards use tenant-timezone calendar boundaries, not rolling UTC.

## Source references (verbatim, for cloning)
- Pricing hook: `D:\flavornews-web\src\components\cities\commerce\usePricing.ts`
- Ledger + edge-fn contracts: `D:\flavornews-web\docs\cities-network\CONTRACT.md` §2/§3/§4
- One-time create fn: `D:\flavornews-web\supabase\functions\create-city-onetime-payment\index.ts`
- Admin revenue rollup: `D:\flavornews-web\src\components\cities\admin\AdminRevenueOverview.tsx`
