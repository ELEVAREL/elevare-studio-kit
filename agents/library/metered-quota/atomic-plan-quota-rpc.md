# Atomic per-period plan quota — `consume_quota` / `refund_quota`

Harvested from `D:\HausAI\supabase\migrations\*_fn_consume_quota.sql` / `*_fn_refund_quota.sql`.
The reusable shape for **any metered product** where a tier buys N units per calendar period.

**Not the same asset as** `serverless-thin-client/atomic-metered-credits.md`. That one is a
**balance** model — prepaid credits, `UPDATE … WHERE credits + delta >= 0`, granted by a webhook,
never resetting. This one is a **periodic allowance** model — a per-calendar-month counter whose cap
is resolved from a plan table by tier, with a fair-use ceiling behind "unlimited" and a capped
refund path. Pick by whether the user *buys* units or *is allotted* them.

---

## The two non-negotiable properties

```sql
create or replace function public.consume_quota(
  p_subject_id uuid, p_subject_kind text, p_metric text, p_amount integer default 1
) returns jsonb language plpgsql security definer set search_path = '' as $$
…
  -- ① THE LIMIT IS RESOLVED INSIDE THIS FUNCTION, from plan_limits joined to the
  --    subject's tier. It is NEVER a parameter. A caller that could pass a limit
  --    is a caller that could raise it.
  select s.tier into v_tier from public.subscriptions s where s.user_id = p_subject_id;
  v_tier := coalesce(v_tier, 'free');          -- a missing row degrades to LEAST privileged
  select pl.limit_col, pl.fair_use_ceiling_col into v_limit, v_ceiling
    from public.plan_limits pl where pl.tier = v_tier;
  if v_limit is null and v_ceiling is null then
    raise exception '…no cap configured…' using errcode = '23514';   -- FAIL CLOSED
  end if;
  v_cap := coalesce(v_limit, v_ceiling);       -- NULL limit = "unlimited", enforced at the ceiling

  -- ② THE LIMIT TEST LIVES IN THE `DO UPDATE … WHERE`, so the check and the
  --    increment are ONE statement against ONE row. ZERO ROWS = DENIED.
  insert into public.usage_counters as uc (subject_id, metric, period_start, used)
  values (p_subject_id, v_metric, v_period, p_amount)
  on conflict on constraint usage_counters_subject_metric_period_key do update
     set used = uc.used + p_amount
   where uc.used + p_amount <= v_cap
  returning uc.used into v_used;

  if v_used is null then … return {allowed:false, …} end if;   -- the WHERE rejected it
$$;

revoke all on function public.consume_quota(uuid,text,text,integer) from public, anon, authenticated;
grant execute on function public.consume_quota(uuid,text,text,integer) to service_role;
```

**Why the `WHERE` on the `DO UPDATE` is the whole safety model:** Postgres re-evaluates it against
the row version the competing transaction just committed, so the second caller sees the first
caller's increment. A read-then-write lets two tabs both pass the check at 9/10 and land on 11.

**Why `service_role` only:** it is `SECURITY DEFINER` and takes the subject as a *parameter*, so any
role that can execute it can spend **any** subject's quota. `authenticated` must never hold it.

## Five details that each earned their place

1. **Short-circuit `p_amount > v_cap`.** A single request larger than the whole allowance can never
   be granted — but on a *fresh period* the `ON CONFLICT` never fires, so the plain INSERT succeeds
   and over-grants. Check before the insert.
2. **An unknown metric or subject kind RAISES**, never defaults. A cut feature whose metric was
   removed from the enum must give a loud error, not a silently-metered phantom quota.
3. **`limit` NULL = "unlimited", enforced at `fair_use_ceiling`.** Return both `limit` and
   `effective_limit` + a `fair_use` boolean so the UI can print the honest wording. **The ceiling
   number must be in your Terms** — a pricing page that says "Unlimited" over an enforced number the
   Terms do not contain is a claim–reality failure. Silence about the ceiling is one too.
4. **Reserve at the point of value, not at request entry.** A clarifying question, a refusal, or a
   repair retry produces nothing the user asked for; metering it punishes them for the system
   needing information. Reserve the unit when the operation commits to producing the artifact —
   still *before* the expensive call completes, and still atomic. Do not turn this into read-then-write.
5. **Run a second, never-user-surfaced ABUSE ceiling over raw upstream spend** at ~3–6× the visible
   cap, covering **every** path to the API (including the ones that consume zero visible units). A
   ceiling that doesn't cover every path is a ceiling over the paths you remembered. If a real user
   ever hits it, that is a bug in the ratio, not a limit working.

## `refund_quota` — and the release path that is load-bearing

A user must not be charged for *your* failure, or for being told no by a guardrail. But an uncapped
refund is a free-unit farm. So: decrement **floored at 0**, write an audit row, and **refuse once the
subject has N granted refunds in the current UTC day — recording the refused attempt too**
(`granted=false`). Refunds beyond the cap are *logged, not granted*.

**The release branch is not a nicety.** If you meter an abuse ceiling *before* the upstream call, a
layer-1 classifier refusal makes zero upstream calls — so without a bounded-at-zero release, N
refusals lock the user out for a whole period having cost you nothing. On a compliance refusal path
that is a refusal turning into an account-wide denial of service.

## Two caps, two concurrency mechanisms — know which you have

| cap shape | safe with | why |
|---|---|---|
| `counter + n <= limit` (**one row**) | the `DO UPDATE … WHERE` above | Postgres re-evaluates against the committed row version |
| `count(rows) < limit` (**many rows**) | **`pg_advisory_xact_lock` keyed on the subject** | under READ COMMITTED two concurrent inserts of *different* rows each count 0 and both pass — a phantom |

Keep the count in the `WHERE` as defence in depth, but the lock is what makes it correct. This
applies to any "at most N saved X" / "at most N members" / "at most N refunds per day" cap.

## What it costs

One `plan_limits` table (tier → limits, seeded by migration, **never a constant in a component**),
one `usage_counters` table with a **UNIQUE `(subject, metric, period_start)`** constraint — that
index *is* the money path's `ON CONFLICT` target — one audit table for refunds, and two functions.
One round-trip per metered operation.

## What it does NOT do

- **It is not idempotent, and must not be.** Two identical calls spend two units — that is the point.
  Idempotency belongs to your *fulfilment* path (a DB `UNIQUE` on the external event id), never here.
- **It does not do rollover, proration, or mid-period tier changes.** An upgrade mid-period resolves
  the *new* tier's cap against the *existing* counter, which may leave a user instantly over-cap or
  instantly refilled. Decide that deliberately; the function does not.
- **Calendar-month UTC only** as written. A shop-local or anniversary period is a different
  `period_start` helper (and money dashboards must use shop-local calendar boundaries — STANDARDS).
- **It does not stop the caller from lying about the subject.** `service_role` + a subject parameter
  means your route's identity resolution *is* the authz. Never expose it to `authenticated`.
- **It cannot see a widened value that a DB CHECK still rejects.** Adding a metric, a tier, or a
  subject kind means extending every gating enum/CHECK **in the same migration** — in-code unit tests
  pass while the live insert 500s. One live insert of the new value before claiming done.
- **A green unit suite is not proof of race-safety.** See
  [`pg-cron-concurrency-proof.md`](pg-cron-concurrency-proof.md) — a pooled connection serializes and
  proves nothing.

## Assumes / adapt

- Postgres/Supabase. Enums for tier / metric / subject kind (a raise on an unknown value is the
  feature). Every `SECURITY DEFINER` function pins `set search_path = ''`.
- Two subject kinds (`user`, `anon_session`) in the origin; drop the anon branch if you have one.
  Anon caps live as data on the free tier row, not as a constant in a route — re-enabling a trial
  should be **one number**.
- Return a JSONB envelope (`allowed`, `used`, `limit`, `effective_limit`, `fair_use`, `reset_at`,
  optional machine `reason`) and have the UI branch on the machine code, never on message copy.

## Related

- `serverless-thin-client/atomic-metered-credits.md` — the prepaid-balance cousin.
- `multi-stream-monetization/add-paid-streams-kit.md` — the DB-driven pricing table this pairs with.
- Memory `[[idempotency-db-constraint]]`, `[[payments-permission-model]]`.
