# Empirical anon + cross-tenant leak sweep (Supabase / PostgREST)

**Runnable asset:** [`_scripts/anon-sweep.mjs`](_scripts/anon-sweep.mjs) — zero dependencies, Node 18+.
Harvested and **generalised + fixed** from `D:\HausAI\scripts\anon-sweep.mjs` (`npm run audit:anon`).

---

## What it is

A script that takes your project's **public publishable key** — the one shipped in the browser —
and tries to read, write, and call everything, over real HTTP against real PostgREST. It then
takes a **real user's JWT** and tries to read another user's rows.

It exists because **the Supabase security linter does not flag `USING (true)`**, and it cannot see
a missing `REVOKE`. A policy that reads as "mine, plus orphans" —
`USING (user_id = auth.uid() OR user_id IS NULL)` — is a public dump of every unowned row to
anyone holding the anon key, and it lints clean. That exact shape was a **live CRITICAL leak** on a
prior Elevare project (guest session tokens + PII). The only honest proof is to try it.

## When to reach for it

- **Before launch on every new Supabase project**, without exception. Wire it as `npm run audit:anon`.
- After any migration that adds a table, a policy, or a `GRANT`.
- After swapping an auth/ownership model (the removed-field class: policies survive the column they referenced).
- On an inherited/migrated project, before you believe anything the previous builder claimed.
- In CI on the staging project, once you have seeded rows (see limitations).

## What it costs

- One HTTP round-trip per table for the anon read, plus one per owner-column shape, plus one
  INSERT probe, plus one per RPC, plus one per table for the cross-tenant read. A 20-table project
  is a few hundred requests and finishes in seconds.
- A **service-role key** is required for full value (schema discovery + row counts). It runs without
  one and says loudly that it is proving much less.
- The INSERT probe is the one non-read-only action. It posts `{}` and expects rejection — but on a
  project where anon inserts *are* allowed it **will create a row**. That is the finding. Run against
  staging first, or `SKIP_WRITES=1`.

## What it does NOT do — read this before trusting a green run

1. **It cannot prove isolation on an EMPTY table.** A table with zero rows has nothing to leak. The
   script reports those as `INCONCLUSIVE` and fails the run by default (`ALLOW_EMPTY=1` to
   override) precisely because *pre-launch, most tables are empty* — which is when you run it.
   **Seed at least one row per table, and at least one row per tenant, before you believe a PASS.**
   This was the original version's fatal flaw: its criterion was `status 200 && rows > 0`, so a
   wide-open policy on an empty table scored `ok`.
2. **It does not test the `service_role` path.** Anything your app reaches with the service key is
   gated by *your code*, not by the DB. This sweep says nothing about that gate. (See
   `guest-capability-token/capability-token-guest-intake.md` — under service-role the token *is*
   the whole authz boundary.)
3. **It tests one cross-tenant direction with two accounts.** It does not model roles, org
   membership, shared/team rows, soft-deleted rows, or a third tenant. Ownership is detected by
   column name (`OWNER_COLUMNS`); a table that expresses ownership through a join table is invisible
   to it and must be checked by hand.
4. **It does not read policies.** It reads *behaviour*. A policy that is correct today and a policy
   that happens to return nothing today look identical to it.
5. **RPC results are ambiguous by design.** PostgREST returns 404 both for "no function with these
   arguments" and, in some configurations, for "not visible to this role". The script prints `ok?`
   and asks a human to confirm the `EXECUTE` grant rather than reporting a status it cannot
   disambiguate.
6. **It only covers the `public` schema exposed to PostgREST.** Storage buckets, Realtime channels,
   Edge Functions, and any other exposed schema are separate surfaces with separate holes.
7. **It is not a WAF or a scanner.** No injection, no rate-limit, no auth-flow testing.

## The criterion, and why it changed

| | old | now |
|---|---|---|
| anon SELECT | `200 && rows > 0` → leak | **any `200`** → leak (unless declared in `PUBLIC_TABLES`) |
| anon INSERT | `200/201` → leak | `200/201` → leak, **and `400/409/422` → warning** (a validation error means the request got *past* privilege and RLS; a well-formed body would have landed) |
| table list | hardcoded | **discovered** from the OpenAPI root **with the service key** |
| roles tested | `anon` only | `anon` **+ two signed-in users, cross-read** |

A `200` with `[]` is a failure, not a pass: it means `anon` holds `SELECT` on that table and the
only thing between the public and every row you ever write is a policy. The studio's posture is
`REVOKE ALL … FROM anon, authenticated` plus RLS — grants first, policies as depth.

**Discover privileged, probe unprivileged.** Discovering the table list with the anon key is
self-defeating: a correctly locked-down project shows anon an empty schema, so the sweep proudly
probes nothing and passes.

## Assumes / adapt

- Supabase-hosted PostgREST at `${SUPABASE_URL}/rest/v1` and GoTrue at `/auth/v1`. Adapt the two
  URL prefixes for self-hosted.
- Email+password sign-in is enabled for the two test accounts (used only for the cross-tenant probe).
- `PUBLIC_TABLES` is your explicit allowlist of tables anon is *meant* to read (a pricing table, a
  public catalog). Everything not on it must refuse. Keep this list short and justified — it is the
  one place a real leak can be waved through.
- `OWNER_COLUMNS` defaults to `user_id,owner_id,profile_id,account_id`. Set it to your schema's
  actual ownership columns or the cross-tenant probe under-reports.

## Related

- STANDARDS.md — *"An anon/guest-session table's RLS is the ONLY gate"*, and *"Pick a signal that
  CANNOT be present when the thing is broken."*
- Memory `[[anon-rls-readable-session-leak]]` (the original live CRITICAL), `[[supabase-anon-sweep-audit]]`.
- `supabase-nextjs-pwa/service-role-free-supabase-security.md` — the posture this sweep verifies.
