# CANONICAL-CONTRACT reconciliation doc — pin one truth after a parallel planning wave

Harvested from `D:\flavornews-web` (`docs/cities-network/CONTRACT.md`). When several planning agents produce docs in parallel (a schema plan, a payments plan, a build plan), they DRIFT — different table names, different pricing keys, different column shapes. If build agents code against three diverging docs you get a green build hiding broken cross-agent contracts. The fix: after the planning wave and after the schema is APPLIED, one agent produces a single authoritative CONTRACT.md pinned to reality, and every build agent codes against THAT.

## When to reach for it
Any multi-agent build where planning was itself parallelized, OR where a schema/API was applied out-of-band (via MCP/dashboard) and the planning docs are now stale. Especially when N build agents will run in parallel against shared seams (a DB schema, a pricing/enum vocabulary, edge-fn request/response shapes, a ledger). Produce this BEFORE the build wave starts. Pairs with `parallel-fix-wave.md` (the write-wave itself) and `parallel-monetization-wave.md` (the file-ownership split).

## Why a plan is not a contract
- Planning docs are aspirational; the applied schema is real. Where they disagree, the DB wins — but only if someone writes down that the DB wins, table by table.
- Parallel planners invent different names for the same thing (`city_business_subscriptions` vs a `tier` column ON `city_businesses`; `celebration` vs `city_celebrations`; `order_type` vs `source`). Each is defensible; only ONE is applied. A build agent that picks the wrong doc's name writes code that compiles and fails at runtime.
- The CONTRACT is the single seam-of-record: read it before writing any code, and change IT first (then announce) if a shape must change — never fork.

---

## Structure of a good CONTRACT.md (the sample's, generalized)

Open with a **status banner that names the authority**:
> Status: AUTHORITATIVE. The schema is applied and live (ref `<project>`). Where PLAN_A / PLAN_B / SCHEMA disagree, THIS FILE WINS because it matches the database as actually deployed. Read this before writing any code.

Then the sections that pin every shared seam:

1. **Canonical tables (as applied — do NOT invent alternatives).** A table listing each *concern* → the *canonical table/column* → notes. Explicitly call out the alternatives that DON'T exist: "There is **no** `city_business_subscriptions`, **no** `city_celebrations`; the subscription lives ON the row as `tier`/`stripe_subscription_id`/`subscription_status`. Use these instead." Naming the ghosts is as important as naming the real thing — it stops an agent reaching for a plausible-but-wrong name.

2. **Canonical vocabulary keys (as seeded — use these EXACT strings).** Every pricing key / enum value / status string, with recurring-vs-one-time and which stream uses it. Flag any trap value inline: "`event_ticket_fee_pct` is a **PERCENT**, not cents — `amount_cents=500` ⇒ 5.00%. Read as a rate."

3. **The shared ledger / core table — canonical columns (as applied).** The exact column list with types and a one-line purpose each. Then the idempotency rule (partial-unique key), the `source ↔ source_id` map, and a "**there is no** `order_type`/`entity_table`/`metadata`/`paid_at` column — those were a draft; map to these" paragraph.

4. **Cross-boundary contracts (pinned).** Every edge-fn / RPC / API seam: exact request body, exact response shape, the machine `code` enum for errors (UI branches on code, never message text), and the invariants (`.trim()` secrets, no `create(params,{})`, rate limits, amount rebuilt server-side). This is the part a green build does NOT verify — pin it explicitly (see `[[parallel-wave-contract-seams]]`).

5. **RPCs / helpers to add** (security posture: SECURITY DEFINER, `set search_path=public`, REVOKE-then-GRANT).

6. **Owner-decision DEFAULTS the build uses** — the placeholder choices (pricing amounts, moderation policy, phasing) so the build proceeds in parallel without blocking on human sign-off, each marked overridable.

7. **Deltas from each source doc** — a short "what changed vs PLAN_A / PLAN_B / SCHEMA" list, so anyone holding an old doc can see exactly where it's superseded.

8. **File-ownership split for the build wave** — one owner per hot file; everyone else in new-file namespaces (see `parallel-monetization-wave.md`).

## The discipline
- **Produce it after the schema is applied, before the build wave** — it must describe reality, not intent. If the schema shifts mid-build, update the CONTRACT first.
- **Every planning delta gets a line in §deltas** — never silently overwrite; show the drift you reconciled.
- **It supersedes the planning docs, explicitly.** The planning docs stay for rationale/history; the CONTRACT is what you code against.
- **Name the ghosts.** For every real name, list the plausible-wrong names it replaces — that single habit prevents most cross-agent seam bugs.
- **The consumer of a closed set must fail LOUD on an unknown value, and the CONTRACT must say so.** The vocabulary table tells the far side which values exist. It must also bind what happens when a value arrives that is not in it. A silent `else` or a default branch turns a producer-side typo into a plausible-looking artifact nobody investigates. The rule to paste into the table's footnote: *a consumer that receives an unknown value for any of these renders it visibly as `UNKNOWN: <value>` rather than falling through to a default.* Added 2026-09-13 from the audit-report wave's `CONTRACT.md`, whose three-token table (`effort`, `who`, `money_confidence`) carried exactly this line. Enforce it in CI with [`../verification/cross-layer-enum-contract-gate.md`](../verification/cross-layer-enum-contract-gate.md); the visible-UNKNOWN render is the runtime backstop for the values the gate cannot see, and the two are not substitutes.

## Source reference
`D:\flavornews-web\docs\cities-network\CONTRACT.md` (an eight-stream monetization build; reconciled a SCHEMA doc, a STRIPE_PLAN, and a BUILD_PLAN against the applied database).
