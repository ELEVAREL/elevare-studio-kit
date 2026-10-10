# Owner/admin dashboard blueprint (Next.js + Supabase)

**What it is.** The end-to-end recipe for the single-operator **owner dashboard** shipped on Petal & Threads — auth + role routing, the gated dashboard shell, the data-access model (no service-role key), the "every page looks the same" server-component pattern, the reusable card/badge/form primitives, and the live-updating island pattern. Strip the domain nouns (products/orders) and this is the skeleton for **any** admin back-office: a booking manager, a CRM, a content CMS, a support console.

**When to reach for it.** Any job that needs "a public site **plus** a private dashboard where the owner runs the business." Start here instead of re-deriving auth, RLS, nav, and the page shell each time. Pairs with the sibling `ecommerce-supabase-stripe/` recipes (checkout, emails, quotes, auto-print) and `supabase-nextjs-pwa/` (client singleton, RLS).

---

## 0. Stack & the one rule

Next.js App Router (server components by default) + Supabase (Postgres + Auth + Storage) + Tailwind v4 tokens. **The one rule that shapes everything:** the browser only ever holds the **anon** key. There is **no service-role key** in the app. Every privileged write goes through a `SECURITY DEFINER` Postgres function (RPC) that either (a) checks `is_admin()`, or (b) is gated by a server-only shared secret for machine callers (webhooks). This keeps the attack surface tiny and lets the same RLS protect the public site and the dashboard.

```
public site  ──anon──▶  RLS: read active rows only
owner (auth) ──anon──▶  RLS: is_admin() ⇒ read/write everything
webhook (server) ──service? NO──▶ SECURITY DEFINER rpc(secret, payload)
```

## 1. Auth + role routing (owner vs customer, one login)

One `/login` (email + password, Supabase auth). After sign-in, **route by role** — don't build two login pages:

```ts
// after supabase.auth.signInWithPassword(...)
const { data: admin } = await supabase.rpc("is_admin");   // SECURITY DEFINER, checks admin_users table
router.replace(admin ? "/dashboard" : "/account");
```

```sql
-- The role check every policy and rollup reuses.
create function is_admin() returns boolean language sql stable security definer set search_path=public
as $$ select exists (select 1 from admin_users where user_id = auth.uid()); $$;
```

- Admin identity lives in an `admin_users(user_id)` table, **not** a JWT claim you have to mint — add a row to grant access.
- First admin onboarding without a service-role key: single-use invite token → `set_admin_password(token, pw)` RPC (see `ecommerce-supabase-stripe/magic-link-admin-onboarding.md`).
- Header account icon → `/account`; middleware/`proxy.ts` (Next 16 renames `middleware.ts`→`proxy.ts`) redirects unauthenticated `/dashboard/*` to `/login?redirect=…`, and the layout re-checks server-side.

## 2. The dashboard shell (`app/dashboard/layout.tsx`)

- Server component: fetch the session, **redirect if not admin** (defense in depth — never rely on the client route guard alone), then render `<DashboardSidebar>` + `<DashboardTopbar>` around `{children}`.
- **Grouped nav, not a flat list** — this is the taste detail. Split links into `PRIMARY` (daily work) and a second `MANAGE` group under an `<hr>`, with utility links (Guide, View shop, Sign out) pinned to a footer area. One `NavItem` component, `aria-current="page"` on the active link, identical `<NavLinks>` reused by the desktop sidebar and the mobile drawer so they can't drift.

```tsx
const PRIMARY = [Overview, Products, Inventory, Orders, Station, Requests];  // touched every order
const MANAGE  = [Insights, Deals, Settings];                                // checked now and then
// render: PRIMARY.map(NavItem) · <hr> · MANAGE.map(NavItem) · footer(Guide, View shop, SignOut)
```

> Rule of thumb the client cared about: **keep the nav clean and professional.** When you add the Nth feature, put it in the MANAGE group behind the divider — don't grow a long flat list.

## 3. The page pattern (every dashboard page is the same shape)

Each page is an `async` server component that: fetches everything in one `Promise.all`, reduces to view-model numbers, then renders a **row of `StatCard`s** + one or two **section cards** (a list/table + empty state). Copy this skeleton per page:

```tsx
export const dynamic = "force-dynamic";           // dashboard = always fresh
export default async function Page() {
  const supabase = await createClient();          // server client, carries the admin session cookie
  const [a, b, c] = await Promise.all([ /* counts + rows, admin RLS lets it all through */ ]);
  // ...fold rows into totals...
  return (
    <div className="space-y-8">
      <header>…eyebrow + h1…</header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><StatCard …/>…</div>
      <section className="card p-5">{rows.length ? <List/> : <EmptyState/>}</section>
    </div>
  );
}
```

Use `{ count: "exact", head: true }` selects for cheap counters; only pull full rows for the lists you render.

## 4. Reusable primitives (build these once, use everywhere)

- **`StatCard`** — `{label, value, hint?, icon?, href?, tone}` → the metric tile. Wrap in `<Link>` when `href` is set with a real focus ring (`focus-visible:outline-2`). One component backs every number on every page.
- **Status badge** — a `Record<status, className>` map + label map (`paid → "Paid"`, etc.). One `<StatusBadge status>` used in orders, account, station. Tints must be **AA-safe on translucent** (see `offline-native-app/status-type-design-tokens.md`).
- **Forms = Server Actions**, not API routes. A client `<Form>` calls an exported `async` server action; the action validates, writes via the admin-RLS server client (or a secret-gated RPC), then `revalidatePath("/dashboard/…")`. Sticky save bar, inline success/error, `useFormStatus` spinner. `slugify`-type helpers must be **un-exported** (a Server Actions module may only export async fns).
- **Empty states everywhere** — every list renders a friendly "nothing yet, here's what will show up" instead of a blank card.

## 5. Live / real-time without a socket (the island pattern)

Two ways, both cheap, both used here:

- **Poll-and-print station** (push-ish): a client page polls Supabase every 15s for new rows since midnight, chimes, and auto-prints. See `ecommerce-supabase-stripe/label-printer-auto-print-station.md`.
- **Server-seeded polling island** (live metrics): the server component fetches an initial snapshot and passes it to a `"use client"` panel that re-polls an **admin-only rollup RPC** every 20s (pausing when `document.visibilityState !== "visible"`). Used for the live-visitors widget. Pattern:

```tsx
// server page:  <TrafficPanel initial={await supabase.rpc("site_traffic_stats").then(r=>r.data)} />
// client panel: useState(initial) + setInterval(()=>rpc(...).then(setStats), 20_000)
```

## 6. Analytics / "live visitors + clicks" (event table → admin rollup)

The reusable analytics shape, domain-free:

1. **Event table** `site_visits(id, session_id, path, created_at)` — one row per pageview; `path IS NULL` rows are lightweight **heartbeat pings** (a visitor idling on one page still counts as "live" without inflating pageviews). Partial index `where path is not null` for the click aggregates.
2. **Writer RPC** `record_site_visit(p_session, p_path)` — `SECURITY DEFINER`, granted to `anon`, bounded session id, capped path, and an **opportunistic prune** (`if random() < 0.02 delete pings older than 1 day`) so it can't balloon.
3. **Client tracker** mounted site-wide: `crypto.randomUUID()` in `localStorage`, record on each `usePathname()` change + a 25s heartbeat while visible. **Exclude owner/auth routes** (`/dashboard`, `/login`, …) so the operator never pollutes their own traffic.
4. **Reader RPC** `site_traffic_stats()` — `SECURITY DEFINER` but **self-guards with `if not is_admin() then raise`**, and `revoke execute … from anon`. Returns `json_build_object(live, visitors_today, views_today, …)`. Compute "today" in the **shop's timezone** (`now() at time zone 'America/New_York'`), not UTC, so it matches the owner's wall clock.

## 7. Feature-module checklist (what a full owner dashboard contains)

Order of build, each a page under `app/dashboard/`:

| Module | Core moves |
|---|---|
| **Overview** | StatCards (counts, revenue-this-month, needs-action) + low-stock list + recent rows + live-traffic island |
| **Resource CRUD** (products) | table → new/edit form (server actions), image upload to Storage, variants, SEO fields, draft/active/archived status |
| **Inventory** | `+`/`−` quick-adjust + "set exact" against a tracked count; low-stock threshold from settings |
| **Orders pipeline** | list w/ filter tabs → detail; status pipeline `paid→making→shipped→delivered`; carrier+tracking; email on first ship-transition; printable 4×6 slip |
| **Station** | keep-open tab, poll + chime + auto-print (see recipe) |
| **Requests → Quote → Order** | customer form (w/ photo upload) → owner prices → email pay-link → paid → becomes an order (see `quote-to-order-flow.md`) |
| **Insights** | derive top-sellers / most-viewed / conversion / **price-raise recommendations** from orders+views; conservative thresholds; honest empty states |
| **Deals** | discount codes (percent/fixed, min-order, window, usage cap); **validate + recompute server-side at checkout** — never trust a client price |
| **Settings** | one form → a `settings` jsonb row; **merge, don't replace** the blob; drives shipping, announcement bar, thresholds |
| **AI chat** (optional) | cheap model (Haiku), catalog injected as **data not instructions**, per-IP rate-limit RPC, prompt caching |
| **Guide** | in-app `/dashboard/help` + a `docs/USER_GUIDE.md` that **must stay in sync with the actual nav** |

## 8. Security invariants (the non-negotiables)

- **No service-role key in the app.** Privileged writes = `SECURITY DEFINER` RPC + `is_admin()` **or** a server-only secret for webhooks.
- **RLS on every table**, admins via `is_admin()`, public reads scoped to active/own rows. Run the Supabase **advisors** after every migration; the only acceptable residual warning class is the intentional "anon can execute this SECURITY DEFINER rpc" for functions that self-guard.
- **Recompute money server-side** (totals, discounts) inside the order RPC — the client sends intent, never authoritative prices (see `no-service-role-order-rpc.md`).
- **Email-scoped own-read** for customer rows is only safe because **Confirm-email is ON** (an unconfirmed signup gets no session). Document that invariant.
- **Escape everything** that reaches email/HTML (`branded-transactional-email-shell.md`).

## Assumes / adapt
- **Next 16 gotchas** baked in: `proxy.ts` not `middleware.ts`; `generateStaticParams` can't call `cookies()`; Server Action modules export only async fns; embedded-Stripe types need a cast. A cookie-free public client + ISR `revalidate` for the storefront; `force-dynamic` for the dashboard.
- **One operator** assumed (the owner). For multi-tenant/multi-role, replace `is_admin()` with a role/claims check and scope RLS by `org_id`.
- Swap the domain nouns freely — the shell, nav grouping, StatCard/badge/form primitives, the server-seeded polling island, and the event-table→admin-rollup analytics are all domain-agnostic. Keep the "no service-role, recompute server-side, RLS + advisors" spine intact; that's what makes it safe to ship fast.
- Reference implementation: `D:\petal-threads` (`src/app/dashboard/*`, `src/components/dashboard/*`, `src/components/analytics/site-tracker.tsx`).
