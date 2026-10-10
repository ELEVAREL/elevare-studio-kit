# Quote-to-pay on Stripe Connect (fee-split direct charge, no service-role key)

> ## ★ DEAD ARCHITECTURE — DO NOT BUILD FROM THE MONEY HALF. 2026-09-01
>
> Stripe **permanently closed** Elevare's platform account on 2026-08-21 for
> aggregation (appeal denied, final); Elevare can never open another, and Square
> forbids the same thing. **There is no connected account and no
> `application_fee_amount`.** Elevare now **invoices** its percentage — 10% on
> deposits/bookings, 5% on everything else, both on the same client per
> transaction type, monthly in arrears, **never deducted** ([BUSINESS-PLAN.md](../../BUSINESS-PLAN.md) §2).
>
> **What is DEAD here:** "The money flow — direct charge + application fee" and
> "Settlement — the central Connect router" (and every `stripeAccount` /
> `application_fee_amount` / `connect_settlement` reference throughout). Reading
> those as a build guide rebuilds the thing that ended the studio's card processing.
>
> **What is STILL TRUE and worth reading:** the **quote status machine** and the
> whole **security spine — RLS + SECURITY-DEFINER RPCs with zero service-role
> key** (the sanitize trigger, secrets in a DEFINER-only table, token-scoped read
> RPC, secret-gated idempotent writes, allowlist-RLS for the owner). None of that
> depended on Connect.
>
> **For a NEW build, start from the sibling instead:**
> [`ecommerce-supabase-stripe/quote-to-order-flow.md`](../ecommerce-supabase-stripe/quote-to-order-flow.md)
> — the money-owns-itself variant, which is now the only shape the studio ships:
> the **client** owns their Stripe, Elevare joins as a **Developer**, and the fee
> is a separate invoice.

**What it is.** A *quote-then-pay* commerce shape wired for a **marketplace platform fee**: a public request form → the owner prices it in a dashboard → the customer accepts via an **unguessable token link** → a **themed embedded Payment Element** takes a deposit as a **direct charge on the client's connected Stripe account** with an `application_fee_amount` to the platform → **the central Connect router settles** the quote (no per-client webhook) → confirmation emails fire.

This is the money-routing cousin of [`ecommerce-supabase-stripe/quote-to-order-flow.md`](../ecommerce-supabase-stripe/quote-to-order-flow.md). That one is the **platform-owns-the-money** variant (the site's own Stripe, a self-hosted webhook, `place_quote_order`). **Reach for THIS one when the money belongs to a *client* and the studio takes a %** — the charge lands on their account, they're merchant of record, and settlement rides the shared router in memory `[[stripe-connect-blueprint]]`.

**When to reach for it.** Any deposit / booking / estimate / bespoke-catering / commission business where **you built the site but the client keeps the money** and you skim a platform fee: events catering, venue/booking deposits, custom fabrication, "request a proposal → pay a deposit." The whole build is a public marketing site + one private owner dashboard + this pipeline.

*(Harvested from `D:\CoffeeBaby` — Coffee Baby, a Dominican mobile-coffee-cart events-catering site; the studio's **first real Connect fee-split** build. 10% application fee, direct charge on the client's account via Elevare's platform key.)*

---

## The status machine (one `quotes` table)

```
requested ──(owner prices in /admin)──▶ quoted ──(PI created + attached)──▶ accepted ──(router settle_order)──▶ paid
                                                                                └──(owner declines)──▶ declined
```

`quotes` columns that carry the machine (Supabase / Postgres):

```
id uuid pk default gen_random_uuid()
status text not null default 'requested'      -- requested|quoted|accepted|paid|declined
accept_token uuid not null default gen_random_uuid()   -- the PUBLIC url key (NOT the id)
-- customer-supplied (public insert):
customer_name, customer_email (both NOT NULL), customer_phone, event_type (NOT NULL),
event_date date, event_location, guest_count int, drinks_interest text[], notes
-- owner-set (dashboard only):
quote_total_cents int, deposit_cents int, owner_note text, quoted_at timestamptz
-- payment (RPC-only, never client-writable):
stripe_payment_intent_id text, amount_paid_cents int, application_fee_cents int, paid_at timestamptz
created_at, updated_at
```

**`accept_token` is a `uuid`, not the row `id`, and it is the public URL key** (`/quote/<token>`). The quote page is unauthenticated — keying it by a random token, never a sequential/guessable id, is the difference between "share your link" and "enumerate every customer's PII."

---

## The security spine — RLS + SECURITY-DEFINER RPCs, **zero service-role key**

The DB is the security boundary. Ship with **no `service_role` key in the app** at all. Four moving parts:

### 1. Public insert is *safe by construction* via a BEFORE-INSERT sanitize trigger
RLS lets `anon` INSERT (`with_check: true`), but a trigger **overwrites every field the client must not control** — so a hostile request body can't pre-set a price, a paid status, or its own token:

```sql
create function quotes_sanitize_insert() returns trigger language plpgsql as $$
begin
  new.status := 'requested';
  new.quote_total_cents := null;  new.deposit_cents := null;  new.owner_note := null;
  new.quoted_at := null;          new.stripe_payment_intent_id := null;
  new.amount_paid_cents := null;  new.application_fee_cents := null;  new.paid_at := null;
  new.accept_token := gen_random_uuid();   -- server mints the token; client can't choose it
  new.created_at := now();  new.updated_at := now();
  return new;
end $$;
create trigger trg_quotes_sanitize before insert on quotes
  for each row execute function quotes_sanitize_insert();
```
The API route (`/api/quote`) validates + clamps input (email regex, honeypot, per-IP rate limit, string length caps, positive-guest-count) but **does not need to be trusted** — the trigger is the backstop. `anon` gets INSERT but there is **no anon SELECT policy**, so a submitter can't read anything back (the route selects only its own new `id`).

### 2. Secrets live in a table only DEFINER functions can read
```sql
create table server_secrets (name text primary key, value text not null);
alter table server_secrets enable row level security;
-- and grant NOTHING to anon/authenticated. No policy = no direct access.
```
`server_secrets` has RLS on **and zero grants** to `anon`/`authenticated`. Only `SECURITY DEFINER` functions (which run as the table owner) can read it. This is what removes the need for a service-role key: capability is minted per-RPC, gated by a secret the app passes but no browser can read out of the DB.

Rows used: `rpc` (gates attach), `settle` (gates settlement + email callback), `notify_url` (where settle posts the email callback).

### 3. Token-scoped read RPC returns ONLY safe fields
The public pay page and the payment route read the quote through one DEFINER function keyed by the token — it returns display/price fields but **never** the email, token, phone, or raw notes, and only for payable statuses:

```sql
create function get_quote_for_payment(p_token uuid)
returns table(id uuid, status text, customer_name text, event_type text, event_date date,
              event_location text, guest_count int, quote_total_cents int,
              deposit_cents int, owner_note text)
language sql security definer set search_path='public' as $$
  select id, status, customer_name, event_type, event_date, event_location,
         guest_count, quote_total_cents, deposit_cents, owner_note
  from quotes where accept_token = p_token and status in ('quoted','accepted','paid');
$$;
```

### 4. Every write RPC is secret-gated + idempotent
`attach_payment_intent(p_token, p_pi, p_secret)` (gated by `server_secrets.rpc`) flips `quoted→accepted` and records the PI id. `settle_order(...)` (gated by `server_secrets.settle`) is the fulfillment RPC below.

### 5. Owner reads/writes are allowlist-RLS (no admin flag column)
```sql
-- admin_emails(email text pk); RLS: authenticated may SELECT only their own row.
create policy "admins read quotes" on quotes for select to authenticated
  using (exists (select 1 from admin_emails a where a.email = lower(auth.jwt()->>'email')));
create policy "admins update quotes" on quotes for update to authenticated
  using (exists (select 1 from admin_emails a where a.email = lower(auth.jwt()->>'email')));
```
Admin server actions still re-check the allowlist in app code (`requireAdmin()` → `admin_emails` lookup) before any write — defense in depth over the RLS. See the companion [`admin-allowlist-hand-created-user.md`](admin-allowlist-hand-created-user.md) for standing up the owner login.

---

## The money flow — direct charge + application fee (the NEW piece)

`POST /api/payment-intent` (server is the price authority):

```ts
const acct = process.env.COFFEE_BABY_STRIPE_ACCOUNT_ID;      // client's acct_… (from OAuth onboarding)
if (!acct) return 503 { notConnected: true, error: "…text us to reserve" }; // friendly, not a 500
// server-authoritative amount — read from the DB by token, NEVER from the client body:
const { data } = await db.rpc("get_quote_for_payment", { p_token: token });
const amount = quote.deposit_cents ?? quote.quote_total_cents;   // cents
if (!amount || amount < 50) return 422;                          // "not ready to pay"
const applicationFee = Math.round(amount * feePercent / 100);    // platform's %

const intent = await stripe.paymentIntents.create(
  {
    amount, currency: "usd",
    automatic_payment_methods: { enabled: true },
    application_fee_amount: applicationFee,                 // ← platform skims this
    statement_descriptor_suffix: "COFFEE BABY",
    metadata: { order_id: quote.id, /* ← the key the router settles by */
                quote_id: quote.id, accept_token: token, kind: "event_deposit" },
  },
  { stripeAccount: acct }                                   // ← DIRECT CHARGE header. THIS routes it.
);
await db.rpc("attach_payment_intent", { p_token: token, p_pi: intent.id, p_secret: RPC_SECRET });
return { clientSecret, stripeAccountId: acct, publishableKey };
```

Two load-bearing details:
- **`{ stripeAccount: acct }` on the create call** makes it a *direct charge on the client's account* (they're merchant of record, their dashboard, their payouts, they bear Stripe's processing fee; the platform gets only `application_fee_amount`). This is the deliberate choice over a *destination* charge because the client was promised "your own Stripe."
- **`metadata.order_id = quote.id`** is the handle the central router resolves the quote by (`order_id_path='metadata.order_id'` in the registry). Set it or settlement can't find the row.

The client runs on the **platform's** `STRIPE_SECRET_KEY` / publishable key — the connected account never hands over keys. The frontend must scope Stripe.js to the connected account too, or the Element won't resolve the intent — see [`themed-payment-element-connect-delta.md`](themed-payment-element-connect-delta.md).

---

## Settlement — the central Connect router, **no per-client webhook**

This build does **NOT** register its own Stripe webhook. It plugs into the studio's one platform-level Connect webhook → central router (`elevarestudio.co/api/stripe/connect-webhook`) described in memory `[[stripe-connect-blueprint]]`. The router reads `event.account`, looks the client up in the platform registry, and POSTs directly to this app's `settle_order` RPC. Onboarding a client = **one registry-row insert**, not a new webhook.

`settle_order` (SECURITY DEFINER, gated by `server_secrets.settle`, idempotent, `FOR UPDATE` lock):

```sql
create function settle_order(p_secret text, p_order_id uuid, p_provider_ref text, p_amount_total int)
returns jsonb language plpgsql security definer
set search_path='public','extensions','net' as $$      -- 'net' for pg_net; 'extensions' for pgcrypto
declare v_status text; v_fee int; v_notify text; v_did_pay boolean := false;
begin
  if p_secret is distinct from (select value from server_secrets where name='settle')
    then raise exception 'forbidden'; end if;
  select status into v_status from quotes where id = p_order_id for update;   -- lock the row
  if v_status is null then raise exception 'order not found'; end if;
  if v_status <> 'paid' then                                  -- idempotent: only the first run pays
    v_fee := round(p_amount_total * 10 / 100.0)::int;
    update quotes set status='paid', stripe_payment_intent_id=coalesce(p_provider_ref,stripe_payment_intent_id),
       amount_paid_cents=coalesce(p_amount_total,amount_paid_cents),
       application_fee_cents=coalesce(v_fee,application_fee_cents), paid_at=now(), updated_at=now()
     where id = p_order_id;
    v_did_pay := true;
  end if;
  if v_did_pay then                                          -- fire the email callback ONCE
    select value into v_notify from server_secrets where name='notify_url';
    if v_notify <> '' then
      begin
        perform net.http_post(url:=v_notify,
          headers:=jsonb_build_object('Content-Type','application/json'),
          body:=jsonb_build_object('secret',(select value from server_secrets where name='settle'),
                                   'order_id',p_order_id::text));
      exception when others then
        raise warning 'notify dispatch failed for %: %', p_order_id, sqlerrm;  -- NEVER fail settlement on email
      end;
    end if;
  end if;
  return jsonb_build_object('settled', p_order_id::text, 'newly_paid', v_did_pay);
end $$;
```

- **Idempotent by state** (`if v_status <> 'paid'`) + `FOR UPDATE`: a Stripe retry / router re-fire re-runs harmlessly and does **not** re-charge, re-flip, or re-email.
- **Email is a fire-and-forget `pg_net` POST inside a swallowed exception** — the money is recorded even if the email endpoint is down. A missed confirmation email is recoverable; a rolled-back payment is not.
- The old self-hosted `/api/webhooks/stripe` route is kept as a **legacy no-op** (acks and does nothing) so a stale endpoint can never 500 or double-settle.

---

## The email callback — `/api/internal/notify-paid`

`settle_order` calls this endpoint (via `pg_net`, over the same infra, never the browser). It's gated by the same `SETTLE_SECRET`, reads the paid quote through a secret-gated `get_quote_for_notify(p_order_id, p_secret)` DEFINER RPC that returns **only** the email-relevant fields of a `status='paid'` row, and sends the customer + owner confirmation emails via the branded shell. `{ secret, order_id }` in, PII stays server-side. Emails wrap in [`ecommerce-supabase-stripe/branded-transactional-email-shell.md`](../ecommerce-supabase-stripe/branded-transactional-email-shell.md) — same `esc()`/shell + the required "Powered by Elevare Studio LLC" footer, three message types (request-received / quote-sent / payment-confirmed).

---

## Owner "price-and-send" (the dashboard half)

A single server action, `requireAdmin()`-gated:
1. `toCents()` parses the owner's typed total/deposit (strips `$`, rejects ≤0); **deposit is clamped to ≤ total**.
2. `update quotes set quote_total_cents, deposit_cents, owner_note, status='quoted', quoted_at=now()`.
3. Read the row back (RLS: admin can), build `payUrl = ${siteUrl()}/quote/${accept_token}`, send the quote email.
4. `revalidatePath('/admin')`.

A `declineQuote` action flips `status='declined'`. The dashboard is the private half of a **public-site + one-owner-dashboard** app — see [`admin-dashboard/owner-dashboard-blueprint.md`](../admin-dashboard/owner-dashboard-blueprint.md) for the shell.

---

## Assumes / adapt

- **This is the fee-split flavor.** If the site keeps 100% of the money, use [`ecommerce-supabase-stripe/quote-to-order-flow.md`](../ecommerce-supabase-stripe/quote-to-order-flow.md) instead — same request→price→pay shape, simpler settlement (self-hosted webhook, no router, no `stripeAccount`/`application_fee`).
- **Onboarding = one registry insert, not a webhook.** Register the client in `app_private.connect_settlement` on the platform DB (`stripe_account_id`, `settle_url` = `https://<ref>.supabase.co/rest/v1/rpc/settle_order`, `settle_anon_key`, `settle_secret`, `order_id_path='metadata.order_id'`). Confirm `charges_enabled=true` first. Do **not** create a per-client Connect webhook. Full checklist + error catalog in `[[stripe-connect-blueprint]]`.
- **Three secrets must all match:** `SETTLE_SECRET` in { app env, `server_secrets.settle`, the registry row } — rotating means updating all three. `SUPABASE_RPC_SECRET` (for `attach_payment_intent`) must match `server_secrets.rpc`.
- **`pg_net` + `extensions` on the search_path.** `settle_order` needs `net` (for the callback) and `extensions` (for `gen_random_*`/pgcrypto) pinned in `search_path` or it throws at runtime — a repeat gotcha across Connect clients (`[[supabase-nextjs-gotchas]]`).
- **Amount is always server-resolved** from the DB by token. The client sends only the token; the price authority never leaves the server. Same discipline as any checkout.
- **`< 50` cents guard** — Stripe's minimum. Below it, return "not ready to pay," not a Stripe error.
- **`notConnected` is a first-class UI state.** Before the client finishes Stripe onboarding, `acct` is unset → return `503 { notConnected }` and render a "text us to reserve" fallback, never a 500.
- **Swap the nouns** (`quotes`→your resource, `event_*`→your fields, `deposit`→your charge model). The spine — sanitize-trigger + no-anon-SELECT + secrets-table + token-scoped-read + secret-gated-idempotent-settle + router — is domain-agnostic.
