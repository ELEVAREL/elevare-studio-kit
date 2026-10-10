# Service-role-free Supabase security model (staff allowlist + capability-scoped RPCs)

**When to reach for it:** any Next.js + Supabase app that has a small **owner/staff** group who edit everything and an **anonymous public** who may read exactly one thing (an order to pay, a receipt to view) — a shop register, an invoicing tool, a booking desk, a ticket lookup. It lets you ship **without ever putting the `service_role` key in the app**: all trust lives in Postgres. A random person who signs up gets zero rows; the public sees only what a hard-to-guess id unlocks; a webhook can settle a payment without any human session. If your instinct was "I'll just use the service key on the server route," reach for this instead — it's the same power with none of the blast radius.

**Assumes / adapt:**
- **Supabase Auth for staff, anon key everywhere.** Owner pages use a cookie-bound server client; public pages + webhook use a **no-cookie anon client** (`createAnonClient` in `src/lib/supabase/server.ts`). The anon key is public and safe to ship. There is deliberately **no** service-role key in the codebase — don't add one.
- **RLS is ON for every table** and there are **only staff policies** — `... USING (is_staff()) WITH CHECK (is_staff())` for role `authenticated`. No `anon` policy exists, so anonymous clients can't read a single row directly. Public data is reachable **only** through the SECURITY DEFINER RPCs below. This is the load-bearing invariant: table = locked, RPC = the one door.
- **`is_staff()` is the single gate.** It checks a private allowlist table (`app_private.staff`) for the current `auth.uid()`. Adding staff = one insert. Every owner-write RPC re-checks it (defense in depth — don't rely on the page).
- **Public reads are capability URLs, keyed by unguessable ids — never sequential.** `get_public_order(uuid)` takes the order's random `gen_random_uuid()` PK (the QR/pay link). `get_public_receipt(text)` takes a **random** receipt number `'R' || encode(gen_random_bytes(9),'hex')` — *not* the human `PA00042` short code, which is sequential and enumerable. Anyone with the link sees that one order/receipt and nothing else; there's no listing endpoint. If you expose a public read, key it by a random token, and keep the friendly sequential code for display only.
- **Webhook settlement is secret-gated, not session-gated.** A payment webhook has no user. `settle_order(p_secret, …)` compares `p_secret` against a private DB config row (`app_private.config.settle_secret`) that must equal the server's `SETTLE_SECRET` env var, **and** verifies the paid amount equals the order total, **and** is idempotent (only transitions `pending → paid`). Same pattern powers `get_push_targets` / `delete_push_subscription`. Rotating the secret means updating **both** the env var and the DB row.
- **Private schema for secrets/allowlist.** `app_private.staff` and `app_private.config` live in a non-`public` schema with no API exposure and no policies — nothing but SECURITY DEFINER functions (which `SET search_path` to include it) can see them.
- **Every SECURITY DEFINER function pins `search_path`** (`SET search_path TO 'public'` / `'public','app_private'`) — mandatory, or a caller can shadow your tables via their own search path and hijack a definer function.
- **Reference:** `D:\precisionaim` — `src/lib/supabase/server.ts` (the two clients), `src/app/api/webhook/route.ts` + `src/app/api/checkout/route.ts` (RPC call sites), `MAINTAINER.md` ("Architecture — no service-role key"). The SQL below is the live schema from Supabase project `wqhjmijihfdjkmugpyvh` (it was applied via migrations, not committed as files — copy from here).

## 1. Two Supabase clients — one with the session, one without

```ts
// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Owner pages: bound to request cookies → carries the staff session, hits RLS as `authenticated`. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(URL, ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll(),
               setAll: (s) => { try { s.forEach(({name,value,options}) => cookieStore.set(name,value,options)); } catch {} } },
  });
}

/** Public reads + webhook: NO cookies, never sees a session. Reaches data only through
 *  SECURITY DEFINER RPCs. Uses the anon key. This is the "no service_role" workhorse. */
export function createAnonClient() {
  return createServerClient(URL, ANON_KEY, { cookies: { getAll: () => [], setAll: () => {} } });
}
```

## 2. The gate + staff-only RLS (no anon policy anywhere)

```sql
-- allowlist lives in a private schema (no API exposure, no policies)
create schema if not exists app_private;
create table app_private.staff  (user_id uuid primary key);
create table app_private.config (key text primary key, value text not null);  -- holds 'settle_secret'

-- the ONE gate. STABLE + SECURITY DEFINER + pinned search_path.
create or replace function public.is_staff() returns boolean
  language sql stable security definer set search_path to 'public','app_private' as $$
  select exists(select 1 from app_private.staff where user_id = auth.uid());
$$;

-- every table: RLS on, staff-only, for authenticated. NO anon policy → anon sees nothing directly.
alter table public.orders enable row level security;
create policy staff_all_orders on public.orders for all to authenticated
  using (is_staff()) with check (is_staff());
-- ...repeat identically for products, order_items, receipts, push_subscriptions, shop_settings
```

## 3. Public reads — capability-scoped, keyed by a RANDOM id (definer functions)

```sql
-- Order lookup by its random UUID PK (the pay/QR link). Returns one order as JSON, or null.
create or replace function public.get_public_order(p_id uuid) returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select public._order_public_json(p_id);   -- builds a whitelisted JSON shape, no internal columns
$$;

-- Receipt lookup by a RANDOM token, NOT the sequential short code.
create or replace function public.get_public_receipt(p_no text) returns jsonb
  language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('receipt_no', r.receipt_no, 'issued_at', r.issued_at, 'data', r.data)
  from public.receipts r where r.receipt_no = p_no;
$$;

-- Receipt numbers are unguessable, issued once, idempotent:
--   v_no := 'R' || encode(gen_random_bytes(9), 'hex');   -- e.g. R3f9c1a...  (18 hex, ~72 bits)
-- The human-facing "PA00042" short_code is display-only and never a lookup key.
```

## 4. Owner writes — definer RPCs that re-check `is_staff()`

```sql
create or replace function public.create_order(p_items jsonb, p_customer_name text default null,
                                               p_note text default null, p_tax_cents int default 0)
  returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_staff() then raise exception 'not authorized'; end if;   -- gate, even inside definer
  -- ...server-side recompute of subtotal/tax from p_items (never trust client totals),
  --    clamp qty/price with greatest(coalesce(...),0), insert order + items, return {id, short_code}
end; $$;
-- mark_order_paid_manual(p_order_id, p_method) follows the same shape: is_staff() gate → update
--   pending→paid → _issue_receipt(). Totals are recomputed in SQL, not taken from the client.
```

## 5. Webhook settlement — secret-gated, amount-verified, idempotent (no session)

```sql
create or replace function public.settle_order(p_secret text, p_order_id uuid,
                                               p_provider_ref text, p_amount_total int)
  returns jsonb language plpgsql security definer set search_path to 'public','app_private' as $$
declare v_secret text; v_total int; v_status text;
begin
  select value into v_secret from app_private.config where key='settle_secret';
  if v_secret is null or p_secret is distinct from v_secret then raise exception 'forbidden'; end if;
  select total_cents, status into v_total, v_status from public.orders where id=p_order_id;
  if v_total is null then raise exception 'order not found'; end if;
  if p_amount_total is not null and p_amount_total <> v_total then raise exception 'amount mismatch'; end if;
  if v_status = 'pending' then                                    -- idempotent: only pending→paid
    update public.orders set status='paid', provider_ref=p_provider_ref, paid_at=now() where id=p_order_id;
  end if;
  return jsonb_build_object('receipt_no', public._issue_receipt(p_order_id));
end; $$;
```

```ts
// The webhook route holds no session — verify the processor signature FIRST, then:
const supabase = createAnonClient();
await supabase.rpc("settle_order", {
  p_secret: process.env.SETTLE_SECRET,   // must equal app_private.config.settle_secret
  p_order_id: settlement.orderId,
  p_provider_ref: settlement.providerRef,
  p_amount_total: settlement.amountTotalCents,
});
```

**Why this beats "just use the service key on a route":** the service_role key bypasses RLS entirely — one leaked env var, one SSRF, one over-broad route and every table is readable/writable. Here the *strongest* credential the app holds is the anon key (public by design) plus a settlement secret that can do exactly one thing (settle a matching-amount order). The database is the security boundary, so a mistake in a route can't exceed what that route's RPC was allowed to do.
