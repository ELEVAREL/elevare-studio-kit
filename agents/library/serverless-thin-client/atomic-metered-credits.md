# Atomic metered-credits spine (Postgres RPCs + charge-upfront / refund-on-failure)

**When to reach for it:** any product that meters usage against a per-user balance — AI credits, API quota, tokens, "runs", pay-as-you-go units. The money-correctness spine: a **debit that can't go negative under concurrency**, a **grant that can't double-credit under webhook/retry**, and a caller discipline that **charges before the work and refunds if the work fails**, so a crash never bills a user for nothing and a race never lets them overspend.

The two guarantees live in Postgres, not in app code — a single `UPDATE ... WHERE credits + delta >= 0` is atomic where a `SELECT`-then-`INSERT` is a race. (Studio memory: [[idempotency-db-constraint]] — money idempotency is a DB UNIQUE constraint, never SELECT-then-INSERT.)

**Origin:** asky (`askt_spend`/`askt_grant` RPCs + `api/ask.js` charge/refund discipline). Verified against the live functions; de-branded (`askt_*` → `credit_*`, `app_users`).

---

## The two RPCs (this is the whole safety model)

```sql
-- SPEND: atomic decrement that cannot cross zero. Returns the new balance, or -1
-- if the charge would overdraw (the row is left untouched — no partial spend).
create or replace function credit_spend(p_user uuid, p_delta integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare nb integer;
begin
  if p_delta < 0 then
    update app_users set credits = credits + p_delta
      where id = p_user and credits + p_delta >= 0     -- the guard: no overdraft, atomically
      returning credits into nb;
    if nb is null then return -1; end if;              -- would overdraw -> refuse, unchanged
  else
    update app_users set credits = credits + p_delta where id = p_user returning credits into nb;
  end if;
  insert into credit_ledger (user_id, delta, reason) values (p_user, p_delta, p_reason);
  return nb;
end; $$;

-- GRANT: idempotent top-up. The ledger row is inserted FIRST; a UNIQUE stripe_id
-- makes a webhook retry hit unique_violation and return the current balance
-- WITHOUT crediting again. The balance update only runs after a fresh insert.
create or replace function credit_grant(p_user uuid, p_delta integer, p_reason text, p_stripe text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare nb integer;
begin
  begin
    insert into credit_ledger (user_id, delta, reason, stripe_id) values (p_user, p_delta, p_reason, p_stripe);
  exception when unique_violation then
    return (select credits from app_users where id = p_user);   -- already granted for this payment
  end;
  update app_users set credits = credits + p_delta where id = p_user returning credits into nb;
  return nb;
end; $$;
```

```sql
create table credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references app_users(id) on delete cascade,  -- erase cascades the ledger
  delta      integer not null,          -- negative = spend, positive = grant
  reason     text,                      -- "opus_message" | "file" | "purchase" | "message_refund" ...
  stripe_id  text unique,               -- THE idempotency key for grants (Checkout Session id); null for spends
  created_at timestamptz not null default now()
);
```

Why the ordering matters in `credit_grant`: the UNIQUE `stripe_id` on the **ledger insert** is what makes it idempotent. Insert first — if it's a duplicate payment, the `unique_violation` short-circuits **before** the balance is touched, so a retried Stripe webhook physically cannot credit twice. Never reorder the update ahead of the insert.

## Node wrappers (in `lib/store.js`, using the `rpc()` helper from `username-password-serverless-auth.md`)

```js
async function spend(userId, credits, reason) {
  const nb = await rpc("credit_spend", { p_user: userId, p_delta: -Math.abs(credits), p_reason: reason });
  return typeof nb === "number" ? nb : (Array.isArray(nb) ? nb[0] : -1);   // -1 => insufficient balance
}
async function grant(userId, credits, reason, stripeId) {
  const nb = await rpc("credit_grant", { p_user: userId, p_delta: Math.abs(credits), p_reason: reason, p_stripe: stripeId || null });
  return typeof nb === "number" ? nb : (Array.isArray(nb) ? nb[0] : null);
}

// Prices live in code, one editable table — no external product IDs to keep in sync.
const CREDIT_COST = { sonnet: 3, opus: 10, search: 3, file: 3 };  // per-action sale price
```

## Caller discipline — charge up front, refund if the work fails

The pattern that keeps billing honest across partial failures. A privileged "owner"/admin role is exempt from all charges.

```js
// 1. Charge the base cost BEFORE calling the expensive service.
let baseCharged = 0;
if (!owner) {
  const cost = S.CREDIT_COST[choice] || S.CREDIT_COST.sonnet;
  const nb = await S.spend(user.id, cost, choice + "_message");
  if (nb === -1) { send(res, { t: "error", message: "Out of credits." }); res.end(); return; }  // refused, unchanged
  user.credits = nb; baseCharged = cost;
}
// 2. If we bail before producing anything, give it back.
async function refundBase() {
  if (baseCharged) { try { const nb = await S.grant(user.id, baseCharged, "message_refund"); if (nb != null) user.credits = nb; } catch (_) {} baseCharged = 0; }
}

const r = await fetch(UPSTREAM, { ... });
if (!r.ok) { await refundBase(); /* upstream never ran -> refund */ ... return; }

// 3. Per-artifact charges: charge, build, refund that unit on build failure.
for (const spec of fileSpecs) {
  if (!owner) {
    const nb = await S.spend(user.id, S.CREDIT_COST.file, "file");
    if (nb === -1) { send(res, { t: "info", v: "out of credits — stopping." }); break; }
  }
  try { const f = await buildFile(spec); send(res, { t: "file", ...f }); }
  catch (e) { if (!owner) { try { await S.grant(user.id, S.CREDIT_COST.file, "file_refund"); } catch (_) {} } }
}

// 4. Metered side-effects you only know after the fact (e.g. N web searches) are
//    charged best-effort AFTER — never block delivery of an answer already produced.
if (!owner && usage.searches > 0) { try { await S.spend(user.id, S.CREDIT_COST.search * usage.searches, "web_search"); } catch (_) {} }
```

## The refund uses `grant`, not `spend(negative-of-negative)` — but note the idempotency gap

Refunds call `grant` **without a `stripe_id`** (`p_stripe = null`). That's correct — a refund is a genuine new positive ledger entry, not a replay. But it means refunds are **not** idempotent: if your handler can run twice for the same failure, guard the refund with the same `baseCharged`-cleared-to-0 flag shown above so it fires at most once per request. Only *grants tied to a payment* get the UNIQUE `stripe_id` protection.

---

## Load-bearing invariants

1. **The overdraft guard lives in the `WHERE`, atomically.** `credits + p_delta >= 0` in the same UPDATE that decrements is the only thing preventing two concurrent requests from each passing a JS-side balance check and both spending. Never move it to app code.
2. **Idempotency is the UNIQUE `stripe_id`, insert-first.** This is the DB constraint doing the work — not a `SELECT ... WHERE stripe_id = ?` precheck (which races).
3. **`-1` means "insufficient / refused, row unchanged"** — a real balance is always `>= 0`. Callers branch on `=== -1`, never truthiness.
4. **`SECURITY DEFINER` + pinned `search_path`** so the RPC runs with the needed privileges and can't be `search_path`-hijacked. Grant `execute` only to the role your server uses.
5. **Charge before the work; refund on failure.** Ordering: base charge → call upstream → refund if it never produced → per-artifact charge/refund → post-hoc best-effort charges last. A crash between charge and refund at worst under-refunds by one unit — acceptable; over-charging a user for nothing is not.
6. **Every balance mutation writes a ledger row.** The `credit_ledger` is the audit trail and the reconciliation source when a webhook secret was misconfigured and paid grants were missed — you can replay from Stripe against the ledger.

## Assumes / adapt

- **Assumes the serverless auth spine** in `username-password-serverless-auth.md` (the `rpc()`/`sb()` helpers, `app_users`, the `owner` exemption). Drop the owner branch if every user is metered.
- **Prices in code (`CREDIT_COST` / packs) mean no Stripe Products to maintain** — the buy side builds the amount from the table and the webhook re-checks it (see `vanilla-embedded-stripe-checkout.md`). If you instead sell via Stripe Prices, keep the price IDs and the table in lockstep or the two drift.
- **If you widen the set of `reason` values or add a CHECK/enum on `delta`/`reason`,** migrate the constraint in the same migration as the code change — a new reason string inserted against an old CHECK 500s, and in-code tests won't catch it (studio STANDARDS: constraint-drift needs a live insert). 
- **Grants are for payments _and_ manual admin top-ups.** An admin "set balance to N" is a direct `UPDATE credits = N` (absolute), distinct from `credit_grant` (additive). Keep them separate so an admin correction isn't mistaken for a purchase in the ledger.
- The purchase that calls `grant` with a real `stripe_id` is in `vanilla-embedded-stripe-checkout.md`. The broader "a paying customer must never end with nothing" reliability story (email-sent stamps, recovery pollers) is in `buy-once-fulfillment/stripe-buyonce-fulfillment.md` and `multi-stream-monetization/add-paid-streams-kit.md` — this file is specifically the **balance atomicity + charge/refund** slice.
