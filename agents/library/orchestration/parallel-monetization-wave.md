# File-ownership split for a large parallel build wave — one owner per hot file

Harvested from `D:\flavornews-web` (`docs/cities-network/CONTRACT.md` §8 + `BUILD_PLAN.md` §7). How to fan 5–7 build agents across ONE existing app to add many features at once, without two agents colliding on the same file. The write-mode discipline that lets a big wave run truly in parallel.

## When to reach for it
Any time you dispatch multiple agents to WRITE code into ONE repo simultaneously — a multi-stream monetization build, a redesign integration, a feature wave across an existing app. The failure mode this prevents: two agents editing the same file, clobbering each other, or producing a merge that compiles but has broken seams. The finer-grained cousin of `parallel-fix-wave.md`; the concrete file-split it prescribes.

## The core principle
**Identify the small set of HOT shared files. Give each exactly ONE owning agent. Everything else is new files under per-agent namespaces.** A big app has only a handful of contention points — usually:
- the **routes file** (route registrations),
- the **hub page** (the surface everything mounts into),
- the **owner/admin dashboard page** (where management sections live),
- the **webhook** (the one file every payment stream must extend).

Once those four have single owners and every other agent works in a new-file namespace, N agents run without stepping on each other.

## The split (from the sample — generalize the roles)

| Hot file | Sole owner | Rule |
|---|---|---|
| `src/App.tsx` (routes) | the hub/redesign agent | Others HAND it their route lines to add; or ONE agent batches all new `<Route>`s at each phase boundary. **Append-only, one editor.** |
| `src/pages/CityDetail.tsx` (hub page) | the hub-redesign agent | Sole editor. Tab panels are NEW files it imports. |
| `src/pages/CityManage.tsx` (dashboard) | the owner-dashboard agent | Sole editor for the single act of MOUNTING sections. Each section is its own file (`ManageRevenue.tsx`, `ManageDirectory.tsx`, …) so section internals never touch the page. |
| `supabase/functions/stripe-webhook/index.ts` | the payments agent | Via the **handler-module protocol** below. |
| everything else | the feature agent that creates it | New files under `src/components/<feature>/<stream>/`, `src/pages/`, `supabase/functions/<name>/`. Zero contention. |

**Stream ownership** then partitions cleanly, one agent per disjoint stream: (1) directory + sponsored categories, (2) celebrations, (3) boosts, (4) events + featured, (5) tickets, (6) owner dashboard + admin + revenue RPC, (7) hub redesign + routes. Each owns its own new-file namespace; the four hot files have their single owners above.

## The webhook handler-module protocol (the one true collision, solved)
The webhook is the single file EVERY payment stream must extend — a guaranteed collision if each stream edits it. Solution:
- **Backend agents do NOT edit the webhook during their phase.** Each writes its fulfillment logic as a **new handler module** — `supabase/functions/stripe-webhook/handlers/<stream>.ts` exporting `handle(purchaseType, piOrInvoice, supabase)`.
- **A single integration agent** (a phase-close step, owned by the payments agent) wires the imports into the ONE switch.
- This turns a shared-file collision into a set of independent files + one small serialized merge.
- Fallback if handler-splitting doesn't fit the bundle: **serialize** — only the payments agent edits the webhook; other backend agents hand it their case as a patch.

## Sequencing (what must be serial vs parallel)
- **Phase 0 is serial and blocks everything:** build the shared spine first — the unified ledger table + its RLS/indexes/tamper trigger, the revenue-summary RPC, the pricing seed rows, and the ONE shared checkout component. Nothing parallel starts until this lands and is verified (`pg_policies` / `information_schema`), because every stream depends on it.
- **Then fan out by stream** (disjoint files) in parallel.
- **The hot-file phase** (hub + dashboard + admin + routes) runs parallel too — this is where ownership discipline matters MOST; each agent is the sole editor of its one hot file.
- **Sequence the highest-risk/highest-compliance stream last** (tickets: attendee PII, fee math, oversell-safe inventory, refunds) so the other streams ship without waiting on it.

## Every parallel-write prompt still carries (from `parallel-fix-wave.md`)
1. **Exclusive file ownership** per agent (the table above) — no two touch the same file.
2. **Pinned JSON wire contracts** on every seam — a green build does NOT prove two agents agree on the shape between them (see `canonical-contract-reconciliation.md` + `[[parallel-wave-contract-seams]]`).
3. **Commit per agent.**
4. **One concern per migration** — a co-located failing statement silently rolls back the whole file; each new table / each seed is its own migration, and verify each object actually applied.
5. **Real round-trip QA** after the wave — drive each flow in a browser + live-curl each new edge route's happy AND error path (build-green ≠ ship-green).

## Source reference
`D:\flavornews-web\docs\cities-network\CONTRACT.md` §8 + `BUILD_PLAN.md` §7 / §7b (an eight-stream build across one existing Vite/Supabase/Stripe app, run by 5–7 agents in parallel).
