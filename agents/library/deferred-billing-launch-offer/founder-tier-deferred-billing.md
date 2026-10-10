# Founder-tier deferred-billing offer — free-now, rate-locks-forever, billing-flips-later, email-before-charge

**When to reach for it:** you want to open a **paid tier at launch before you're ready to charge** — capture committed customers now (free), lock them a founder rate forever, and flip real billing on weeks/months later without re-touching the offer. A "Founding 50 / early-bird / charter member" funnel. The pattern is a monetization *runway*: the whole Stripe money-spine is built and shipped but **dormant behind one env flag**, allocation of the scarce founder ordinals is atomic, the scarcity number shown is server-authoritative (never a fake countdown), and the promise "we email you before any charge" is a real, load-bearing commitment. Distinct from the charge-now commerce patterns (`ecommerce-supabase-stripe/`, `multi-stream-monetization/`, `stripe-connect/`) — those all assume you take money at checkout today; this one intentionally does not.

**Assumes / adapt:**
- Next.js (App Router) + Supabase + Stripe, but the four ideas (dormant billing gate, atomic ordinal allocation, server-authoritative scarcity, deferred-charge offer copy) are stack-agnostic.
- A scarce, numbered founder cohort (`FOUNDER_CAP = 50`). Adapt the cap; keep the allocation atomic regardless of size.
- Claiming requires **no card and no account** — a short form is the whole conversion. Don't add friction to a free claim.
- **Honesty is the product here (STANDARDS claim–reality parity).** "Nothing is charged now," "we'll email you before any charge," "locked forever" must all be true and enforced in code (billing genuinely off; a real email step before the first charge; the rate genuinely persisted). A deferred-billing offer that quietly starts charging is a trust-destroying dark pattern — the guardrails below exist to prevent that.

---

## 1. Dormant billing — the whole money-spine, gated behind one flag (default OFF)

Build and ship the entire Stripe integration, but put a **master gate** in front of every charge path. Default OFF. The owner flips `BILLING_ENABLED=true` on the day billing goes live; nothing else changes.

```ts
// lib/stripe.ts — LIVE-ready but DORMANT.
const SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim() ?? "";   // .trim() every secret read

/** Master gate: every charge path checks this. Default OFF. */
export function billingEnabled(): boolean {
  return (process.env.BILLING_ENABLED?.trim() ?? "").toLowerCase() === "true";
}
export function stripeConfigured(): boolean { return SECRET_KEY.length > 0; }

let cached: Stripe | null | undefined;
export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  cached = stripeConfigured()
    ? new Stripe(SECRET_KEY, { appInfo: { name: "<Brand>", url: "<url>" }, typescript: true })
    : null;                       // callers MUST handle null
  return cached;
}
```

```ts
// app/api/checkout/route.ts — gate FIRST, before any Stripe call.
export const runtime = "nodejs";
export async function POST(req: Request) {
  if (!billingEnabled()) {
    return NextResponse.json(
      { ok: false, code: "BILLING_DISABLED", message: "Paid featuring isn't live yet — no card is needed today." },
      { status: 503 },
    );
  }
  const stripe = getStripe();
  if (!stripe) { /* configured-but-missing-key → 503 NOT_CONFIGURED */ }
  // ... create customer + subscription (payment_behavior:"default_incomplete") →
  //     return the PaymentIntent client_secret for a THEMED in-app Payment Element.
  //     Amount/price rebuilt from the env price id server-side (never the client). Never create(params, {}).
}
```

The load-bearing rules:
- **The gate is checked FIRST in the route**, before Stripe is even constructed — dormant means a hard 503 with a machine `code`, not a half-attempted charge.
- **The webhook still runs while billing is off** and records events idempotently — but processes/fulfills none. The ledger is the point; you want the audit trail from day one so flipping the flag doesn't start from a cold cache. (Webhook is the ship-of-truth for fulfillment; the route only opens the intent.)
- **Surface = themed Payment Element** (subscription created server-side with `default_incomplete` → a PaymentIntent `client_secret`), NOT embedded Checkout — this sidesteps the stripe-node `ui_mode`/`apiVersion` gotcha entirely ([[stripe-embedded-uimode-apiversion]]) since you never touch Checkout Sessions. Theme it from the site's tokens (`ecommerce-supabase-stripe/themed-inapp-payments.md`).
- **Ship a `checkout-gate` test** that asserts the route 503s while `BILLING_ENABLED` is unset/false, so a later refactor can't silently arm billing.

Flip-to-live is then: set the price-id env vars + `BILLING_ENABLED=true`. The offer page, allocation, and scarcity counter need no change.

---

## 2. Atomic founder-ordinal allocation (a numbered spot can NEVER be double-issued)

The founder number (1..N) is scarce and public-facing, so its allocation must be race-proof. Idempotency = a DB constraint + a lock, never SELECT-then-INSERT ([[idempotency-db-constraint]]).

```sql
-- Founder columns + hard backstops on the businesses/members table.
alter table public.businesses
  add column if not exists is_founder     boolean  not null default false,
  add column if not exists founder_number smallint,
  add column if not exists founder_since  timestamptz;

-- A duplicate or out-of-range number can NEVER persist, even with a logic bug:
alter table public.businesses
  add constraint businesses_founder_number_range
    check (founder_number is null or founder_number between 1 and 50);
create unique index if not exists businesses_founder_number_key
  on public.businesses (founder_number) where founder_number is not null;

-- Single atomic allocator. Transaction-scoped advisory lock serializes all claims;
-- MAX (not COUNT) so a soft-deleted founder still HOLDS its ordinal (never reissued).
create or replace function public.claim_founder( /* p_slug, p_name, ... */ )
returns table (business_id bigint, founder_number smallint, is_founder boolean)
language plpgsql security definer set search_path = public as $$
declare v_max smallint; v_next smallint; v_is_founder boolean; v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('<project>:founder_alloc'));  -- serialize; auto-released on commit
  select coalesce(max(b.founder_number), 0) into v_max from public.businesses b;
  if v_max < 50 then v_next := (v_max + 1)::smallint; v_is_founder := true;
  else               v_next := null;                  v_is_founder := false;  -- full → still captured as a warm lead
  end if;
  insert into public.businesses (/* ...cols..., */ plan, is_founder, founder_number, founder_since)
  values (/* ...vals..., */ case when v_is_founder then 'featured' else 'none' end,
          v_is_founder, v_next, case when v_is_founder then now() else null end)
  returning id into v_id;
  return query select v_id, v_next, v_is_founder;
end; $$;
revoke all on function public.claim_founder(/* sig */) from public, anon, authenticated;  -- service-role only
```

Four correctness pins:
1. **`pg_advisory_xact_lock`** serializes concurrent claims so two requests can't both read the same max and both get #50.
2. **UNIQUE index + range CHECK** are hard backstops — even a buggy allocator can't persist a duplicate or out-of-range ordinal.
3. **`MAX(founder_number)`, not `COUNT(*)`** — a soft-deleted founder still holds its number; you never reissue an ordinal a canceled member once had.
4. **Full-cohort claims are still captured** as warm leads (`is_founder=false`, `plan='none'`) so the offer form never dead-ends after the cap fills — it converts to a standard-rate waitlist.

`SECURITY DEFINER` + pinned `search_path`, service-role-only, called from a rate-limited server route (no anon access). Prove it with a two-parallel-session concurrency test before shipping.

---

## 3. Server-authoritative scarcity (the number is REAL, calmly shown — never a fake countdown)

The scarcity figure shown on the page is always computed from the real founder count. **No fabricated or fast-ticking urgency widget, no per-second countdown** (STANDARDS: claim–reality parity — urgency is the real number, calmly shown).

```ts
// lib/founder.ts (server-only)
export const FOUNDER_CAP = 50;
export async function getFounderRemaining(): Promise<number> {
  const db = getServiceClient();
  if (!db) return FOUNDER_CAP;                         // graceful: no creds → show full cap (nothing claimed)
  const { data, error } = await db.from("businesses")
    .select("founder_number").not("founder_number", "is", null)
    .order("founder_number", { ascending: false }).limit(1).maybeSingle();
  if (error) { console.error("[founder] count error, showing full cap:", error.message); return FOUNDER_CAP; }
  const max = data?.founder_number ? Number(data.founder_number) : 0;
  return Math.min(FOUNDER_CAP, Math.max(0, FOUNDER_CAP - max));  // clamp [0, cap]
}
```

- The offer page is a server component that reads `getFounderRemaining()` and sets a short **`revalidate`** (e.g. 120s) so the count stays fresh without being a live socket — claim–reality parity without over-engineering.
- The counter component takes `remaining` as a prop and handles `ready | loading | error | soldout` states. On loading it shows the CTA **without a number** rather than a wrong one; the single accent moment is the eyebrow, not a throbbing bar.
- **Sold-out is a first-class state**, not an error: the CTA flips to "get on the standard-rate list" and the claim route captures the warm lead.

---

## 4. The offer page + the deferred-charge promise (copy structure)

The page is the funnel. Its honest, reusable shape:
- **Hero:** the audience-benefit headline (not "sign up") + the counter + a single primary CTA ("Claim your founder spot, free").
- **"What you get"** — 3 concrete value cards, no feature-dump.
- **The founding-cohort explainer + a rate table** with two columns: **Founder rate (locked forever)** vs **Standard rate**, per product line. The locked-forever column is the whole pitch — make the delta visible.
- **The deferred-billing paragraph, stated plainly and repeated:**
  > Free to claim today. Nothing is charged now. Your founder rate is locked in and only starts when billing goes live, and **we'll email you before that happens.** No card needed to claim your spot.
- **FAQ** that answers the trust questions directly: "Do I have to pay now?" (No.) "What happens after the cohort fills?" (Standard rate; founders keep their locked rate.) "Do I need an account?" (No.)
- **Who runs this** — honest about why the offer exists (it funds a free product / it's how we meet businesses we might work with). Transparency converts here.

**The promise is enforced, not just written:**
- "Nothing charged now" is true because billing is genuinely dormant (§1).
- "We'll email you before any charge" must be a **real step in the flip-to-live runbook** — before setting `BILLING_ENABLED=true`, send every founder the heads-up email; the copy commits you to it, so the runbook must honor it. (An `external-approval-golive-watcher`-style script can gate the flip on "notice email sent.")
- "Locked forever" is true because the founder rate is persisted (the `plan`/founder columns + a Stripe founder coupon applied at subscription time when billing arrives).
- Confirmation email on claim reiterates the same plain terms, so the promise is in the customer's inbox, not just on a page they'll never revisit.

---

## 5. Definition of done
- Every charge path 503s while `BILLING_ENABLED` is off; a `checkout-gate` test pins it.
- The webhook records events idempotently even while dormant (ledger from day one).
- `claim_founder` proven race-safe (two parallel sessions can't both get the last ordinal); UNIQUE + range CHECK in place; full-cohort claims captured as warm leads.
- Scarcity number is server-authoritative with graceful no-creds/error fallback to full cap; sold-out is a real state; no fake countdown anywhere.
- Offer copy states "nothing charged now / email before any charge / locked forever" and every clause is enforced in code + in the flip-to-live runbook.
- Flip-to-live is a known, written sequence: notify founders → set price-id envs + `BILLING_ENABLED=true` → verify one real subscription end-to-end.
