# No-service-role-key order creation (webhook → `SECURITY DEFINER` RPC)

**What it is.** A way to let *public, unauthenticated* checkout create rows in privileged tables (`orders`, `order_items`, inventory) **without ever shipping a Supabase `service_role` key**. The write happens inside a `SECURITY DEFINER` Postgres function gated by a **server-only shared secret**, and the function is called *only* from a Stripe-signature-verified webhook. The webhook runs with the plain **anon** key.

**When to reach for it.** Any Next.js + Supabase + Stripe shop (or any "anonymous user triggers a privileged DB write after paying"). It removes the biggest footgun in the stack — a leaked/over-scoped `service_role` key that bypasses all RLS. Also the right shape for: newsletter double-opt-in confirms, contact-form inserts, any post-payment fulfillment.

## The shape

1. **RLS default-deny on `orders`/`order_items`/inventory** — public gets *no* insert grant. Only admins (via `is_admin()`) can read/write them directly.
2. **A `private` schema** (not exposed to PostgREST) holds the shared secret: `private.app_config(key text primary key, value text)`, row `checkout_secret`.
3. **`place_order(p_secret text, p_payload jsonb)` — `SECURITY DEFINER`**, owned by a privileged role, `search_path` pinned. It:
   - `if p_secret is distinct from (select value from private.app_config where key='checkout_secret') then raise exception 'unauthorized'; end if;`
   - **Idempotency:** `if exists (select 1 from orders where stripe_session_id = p_payload->>'stripe_session_id') then return (that order_number); end if;` — a Stripe retry can't double-insert.
   - Inserts the order + items from the JSON payload, generates the human `order_number`.
   - **Decrements inventory** and logs an `inventory_adjustments` row per line (only for `track_inventory && !is_made_to_order`).
   - `returns text` (the order number).

```sql
create or replace function public.place_order(p_secret text, p_payload jsonb)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_session text := p_payload->>'stripe_session_id'; v_num text; v_item jsonb;
begin
  if p_secret is distinct from (select value from private.app_config where key='checkout_secret')
    then raise exception 'unauthorized'; end if;
  -- idempotent on the Stripe session id
  select order_number into v_num from orders where stripe_session_id = v_session;
  if v_num is not null then return v_num; end if;

  v_num := 'PT-' || to_char(now(),'YYMMDD') || '-' || lpad((floor(random()*100000))::text,5,'0');
  insert into orders (order_number, email, customer_name, phone, shipping_address,
      subtotal_cents, shipping_cents, tax_cents, total_cents,
      stripe_session_id, stripe_payment_intent, customer_note, status, paid_at)
  values (v_num, p_payload->>'email', p_payload->>'customer_name', p_payload->>'phone',
      p_payload->'shipping_address',
      (p_payload->>'subtotal_cents')::int, (p_payload->>'shipping_cents')::int,
      (p_payload->>'tax_cents')::int, (p_payload->>'total_cents')::int,
      v_session, p_payload->>'stripe_payment_intent', p_payload->>'customer_note', 'paid', now());

  for v_item in select * from jsonb_array_elements(p_payload->'items') loop
    insert into order_items (order_number, product_id, variant_id, name, sku, unit_price_cents, qty)
    values (v_num, (v_item->>'product_id')::uuid, nullif(v_item->>'variant_id','')::uuid,
      v_item->>'name', v_item->>'sku', (v_item->>'unit_price_cents')::int, (v_item->>'qty')::int);
    -- decrement + audit tracked stock only
    -- (guard on the product/variant's track_inventory + is_made_to_order flags here)
  end loop;
  return v_num;
end $$;
revoke all on function public.place_order(text, jsonb) from public, anon, authenticated;
grant execute on function public.place_order(text, jsonb) to anon;  -- callable, but useless without the secret
```

**The webhook caller** (`src/app/api/stripe/webhook/route.ts`) uses a bare anon client with sessions off, and calls the RPC with the secret from env:

```ts
// src/lib/supabase/rpc.ts — anon, no session, server-only
export function createRpcClient() {
  return createClient(URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
// webhook: verify signature FIRST, then
const { data: orderNumber, error } = await createRpcClient().rpc("place_order", {
  p_secret: process.env.CHECKOUT_RPC_SECRET,  // server-only env, NOT NEXT_PUBLIC
  p_payload,
});
```

## When to reach for it (summary)
Post-payment fulfillment, or any "anonymous action must write privileged rows." Choose this over `service_role`.

## Assumes / adapt
- **Two secrets, kept in sync.** `CHECKOUT_RPC_SECRET` (env) must equal `private.app_config.checkout_secret` (DB). Rotate BOTH or order creation silently fails. Document this as a single-point-of-failure.
- **Only ever call from a signature-verified context.** The secret is the second gate; the Stripe signature is the first. Never expose `CHECKOUT_RPC_SECRET` to the client (no `NEXT_PUBLIC_`).
- **Idempotency key = the payment session id.** If you're not on Stripe, pick a natural idempotency key the caller can't forge/reuse.
- **`SECURITY DEFINER` must pin `search_path`** (`set search_path = public, pg_temp`) — else it's a privilege-escalation vector.
- Granting `execute` to `anon` is safe *because* the body rejects anyone without the secret; the RPC is inert without it. You can also leave it ungranted and rely on the definer owning it.
- The payload carries **server-computed prices** (see `embedded-stripe-checkout-nextjs.md`) — the RPC trusts its caller, so the caller must be the price authority.
