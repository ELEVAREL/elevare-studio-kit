# Proving a Postgres race-safety claim with `pg_cron` workers

Harvested from `D:\HausAI\docs\SCHEMA.md` §6.6. Generic to **any** Postgres concurrency claim.

---

## The problem it solves

You wrote a cap, a counter, an ordinal allocator, or an idempotency key and you believe it is
race-safe. Every test passes. **None of them proves it**, because:

> A single pooled MCP / psql / client connection **serializes**. Firing ten calls down one connection
> proves ten sequential calls work. The first attempt at this spread 10 calls over 10 seconds.

You need genuinely parallel backends. `pg_cron` gives you them, in-database, with no client, no
harness process, and no network jitter.

## The recipe

1. **Install `pg_cron`** (Supabase: `create extension pg_cron;`).
2. **Set up the probe:** a target row in a known state (a counter with exactly 3 units left; a save
   cap of 1 with 5 candidate rows) and a `probe_results` table.
3. **Schedule N identically-scheduled, self-guarding jobs** — every job fires on the same minute,
   calls the function under test once, and writes its own `{worker_id, result, timestamp}` row. Each
   job guards itself so a second tick cannot re-run it.
4. **Wait one tick. Unschedule everything. Read `probe_results`.**
5. **Assert the invariant AND the window.** Record the spread between the first and last worker
   timestamp — a result with a 10-second spread is not a concurrency result.

## The results this produced (state yours the same way)

- **Quota:** 10 workers fired inside a **59 ms** window against a counter with 3 units left →
  **exactly 3 allowed, 7 denied**, final `used` = 10. No over-grant.
- **Save cap:** 5 workers inside a **37 ms** window, 5 different draft rows, limit 1 → **exactly 1
  saved, 4 `save_limit_reached`**, and the DB truly held 1 saved row.

The window is part of the result. Without it, "10 workers, 3 allowed" is unfalsifiable.

## The honest negative result — keep it, it is the most valuable part

An attempt to demonstrate the *phantom* by racing a naive variant with the advisory lock **removed**
did **not** reproduce an over-grant. Each transaction completed in ~2 ms, which is shorter than
pg_cron's worker-start jitter, so they self-serialized.

> The phantom is real under READ COMMITTED semantics but is timing-narrow here. **The advisory lock
> is retained as correctness, not decoration** — but this specific hazard is argued from Postgres
> semantics, not from a reproduction. Removing the lock is not supported by evidence either way.

Write that sentence. A harness that cannot produce the failure it is meant to detect has **not
calibrated itself**, and reporting "we tried to break it and couldn't" as "it is proven safe" is
exactly the manufactured confidence STANDARDS warns about. Say which half you proved.

## When to reach for it

- Any "at most N" cap, any counter, any ordinal/sequence allocator, any `ON CONFLICT` idempotency
  claim, any advisory-lock decision.
- Whenever a reviewer asks "is this race-safe?" and the honest answer is "it should be".
- Before shipping anything on the money path.

## What it costs

- ~30 lines of SQL and one tick of wall-clock (up to 60s with minute granularity).
- `pg_cron` must be installed. **Remove it again afterwards** if it is not part of the product —
  and note in your schema doc that the project now has no scheduler, so nobody later assumes one.
- Jobs are per-database and visible to anyone with access. Do not leave a probe scheduled.

## What it does NOT do

- **It cannot force a race.** Worker-start jitter (tens of ms) sets the floor. Any critical section
  faster than the jitter self-serializes and the hazard stays theoretical. To go tighter you need
  `pg_sleep` inside the transaction to widen the window artificially — which changes what you are
  measuring, so say so.
- **A passing run is one sample.** Re-run it; a race that fires 1-in-50 passes once.
- **It proves the DB function, not the route.** Application-level races (two requests both reading a
  tier, a route that checks then calls) are untouched.
- **It is minute-granular by default.** Sub-minute scheduling needs `pg_cron` ≥1.5 seconds syntax
  and is not universally available.
- **`pg_cron` runs as a database superuser context.** A function you locked to `service_role` may be
  executable by the cron job and *not* by your app. Test the grant separately.

## Assumes / adapt

- Postgres with `pg_cron`. On a platform without it, the equivalent is N **separate** client
  processes (not N promises on one pooled client) with a barrier — harder to set up and noisier.
- Record every worker's result, not just a count. "3 allowed" is weaker than "workers 2, 5, 9
  allowed at T+0ms/T+11ms/T+59ms" when you have to debug a red run.

## Related

- [`atomic-plan-quota-rpc.md`](atomic-plan-quota-rpc.md) — the functions this proved.
- `deferred-billing-launch-offer/founder-tier-deferred-billing.md` — `pg_advisory_xact_lock` ordinal
  allocation, the other count-based cap shape.
- STANDARDS.md — *"Calibrate any NEW automated gate before trusting its verdicts."*
