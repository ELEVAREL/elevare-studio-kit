# Parallel fix-wave orchestration (exclusive file ownership + pinned wire contracts + commit-per-agent + flip-xfail handoffs)

**When to reach for it:** you (the conductor: delivery-lead / marketing-strategist) are dispatching **multiple agents in parallel to WRITE code** across one repo in a single wave — a gate-fix wave (design-auditor + security-reviewer + performance-engineer + code-quality all applying fixes), a multi-slice feature build, or a redesign-integration wave. Parallel *writing* agents are the dangerous case: two agents editing the same file clobber each other, and a change on one side of a request/response contract silently breaks the other. This is the process pattern that prevented contract-seam breakage on the SentinelBox run. The **read-only** cousin is [`../offline-native-app/readonly-multigate-audit.md`](../offline-native-app/readonly-multigate-audit.md) — reach for that when the wave only *audits*; reach for this when the wave *edits*.

**The four rules (put all four in every dispatch):**

1. **Exclusive file ownership per agent.** Before dispatching, partition the work so **no two parallel agents own the same file.** Name each agent's owned paths explicitly in its prompt ("you own `X`, `Y`; do not touch anything else"). If two fixes genuinely need the same file, either merge them into one agent's scope or **sequence** them — never run them concurrently. This alone prevents the most common parallel-wave failure (lost edits from clobbering writes).

2. **Pin the JSON wire contract in EVERY prompt that touches a seam.** A green build / passing `tsc` does **not** prove two agents agree on the shape crossing between them — a fetch caller and its route handler can both compile while disagreeing on field names, status codes, or nullability (cf. memory `parallel-wave-contract-seams`). So the conductor pins the exact request/response shape *in the prompt*, verbatim, for both the producer and consumer agent:
   ```
   Wire contract (do not change without telling the conductor):
     GET /api/session-status?session_id=cs_... →
       200 {status:"ready", licenseKey, edition, downloadUrl}
       200 {status:"processing"} | {status:"unpaid"}
       400 {status:"invalid"} | 404 {status:"not_found"}
   ```
   Both sides build to the *same* pinned shape; neither invents its own. Back it with a committed contract test/fixture where the seam crosses a language boundary (see the golden-token fixture in [`../offline-license/ed25519-offline-license.md`](../offline-license/ed25519-offline-license.md)).

3. **Central commit-per-agent.** Each agent's output is committed as its own atomic commit by the conductor (not merged into a mega-diff). One agent's work reverts cleanly without unpicking another's; the git log shows who changed what; a bisect lands on a single agent's change.

4. **Flip-xfail handoffs for sequenced dependencies.** When agent B depends on agent A's not-yet-built piece, A lands the change **plus** a test that B's side marks `xfail` (expected-fail) until B implements its half; B's job includes **flipping the xfail to a real assertion.** The failing-then-passing test is the explicit, machine-checked handoff — the dependency can't be silently forgotten, and "done" means the xfail is gone and green.

**Then close with a real round-trip QA.** A pinned contract + green build is necessary but not sufficient — before shipping, do one actual end-to-end round-trip across each seam (a real request → real response, real signer → real verifier) so a contract that's *pinned but wrong* is caught by behavior, not just by the type checker (memory `parallel-wave-contract-seams`, `redesign-integration-playbook`).

**Why it worked (SentinelBox v1.1.0):** a full gate wave (design-auditor, art-director, performance, security, code-quality) plus multi-slice feature builds ran in parallel across the engine + web hub with these four rules in the prompts, and **no contract seam broke** — the failures that *were* caught (unauthenticated LAN mutations, the frozen-app matplotlib exclude) were logic bugs the gate agents found, not cross-agent clobbering or seam drift.

**Reinforced (Flavor News craft level-up):** the same four rules ran a ~11-agent wave across one Vite/React/Supabase repo (editorial primitives, admin-shell kit, grid-fetch hooks, page rebuilds) with **zero seam breakage** — the seam here was a shared `FOUNDATION_CONTRACT.md` (tokens + editorial primitive API + motion foundation) that every page-build agent consumed instead of redefining. Takeaway: for a *design/component* wave the "pinned contract" is a committed foundation doc naming the exact token classes, component props, and format helpers — page agents `import` from it, never re-derive it (which is also STANDARDS "match the canonical token source, don't re-derive it"). See `../vite-react-supabase/editorial-frontpage-system.md`.

---

## 5. The three pinned documents (added 2026-09-06, Whyza reposts wave)

Rule 2 above pins a *wire* contract. That is not enough when the lanes are building against a
**database** and against **each other's not-yet-written endpoints**. Three documents, all written
BEFORE fan-out, all quoted or linked in every brief. Three lanes and six gates ran concurrently on
one working tree with **zero merge conflicts** on this kit.

**(a) The schema contract — every NOUN, spelled once.** `docs/CONTRACT.md`, marked
`Status: AUTHORITATIVE`, listing every name a builder types: tables, columns, enum values, function
signatures, notification kinds, badge kinds, report reasons, mod actions, flag keys. Rule 2's wire
contract is not enough on its own — independent lanes invent divergent names for the same entities
(see [`canonical-contract-reconciliation.md`](canonical-contract-reconciliation.md)). Two lines make
it honest rather than another stale doc:

> *"The migrations are the executable form; when this file and an applied migration disagree, the
> migration wins and this file is the bug."*
> *"Tier note: this document is Tier 3. What is LIVE is answered by `list_migrations` + `pg_policies`,
> never by this file."*

A contract doc that does not say which source outranks it becomes a Tier-3 claim read as authority.

**(b) The API seam — written from the CONSUMERS' declared assumptions.** This is the move that is
*not* in rule 2, and it is what to do when UI lanes must be built against an API nobody has written
yet. Each UI lane is told: **put every network call in ONE file** (`components/<lane>/api.ts`) and
**declare its assumed request/response shapes**. The conductor then unions those four declarations
into one `docs/API-SEAM.md` marked AUTHORITATIVE, and the backend lane builds to THAT list.

The union is where the conflicts surface, in writing, before anyone builds:
- a row marked **`ASSUMED — not in any prior contract. Confirm or replace.`** (a lane invented an
  endpoint nobody agreed to);
- a row marked **`these two lanes assume DIFFERENT shapes from the same path. Reconcile before
  building.`** (two consumers of one route disagree — the seam break rule 2 exists to prevent, caught
  by writing it down instead of by a green build that proves nothing);
- a row noting a **stopgap that must be demoted** ("mutes are currently ALSO in localStorage; once
  the endpoint is live the local copy becomes a cache, not the truth").

The doc carries its own enforcement sentence: *"A route that returns a shape is not evidence. The
evidence is a live request that changed a row."* It exists because a previous wave shipped an entire
sign-up funnel calling three database functions that existed nowhere — it typechecked, it linted, it
screenshotted perfectly, and it was completely inert.

**(c) A CLOSED error-code taxonomy.** One section listing every machine token the backend may raise
(`SQLSTATE P0001`, message = a stable token: `daily_post_limit`, `blocked`, `reply_depth`,
`comment_rate_limit`, `repost_rate_limit`, …), plus which failures arrive as permission errors
instead. **The UI switches on the token, never on prose** — and because the list is closed, a lane
adding a new guard has to add its token here, where every UI lane will see it. Note the ones that are
deliberately NOT errors ("an unknown referral code returns a normal value so a caller learns
nothing") — that distinction is invisible in code and load-bearing for security.

### Two lines that go in EVERY brief

- **`If the evidence contradicts this brief, STOP and bring the evidence — that is a successful
  outcome, not a failed step.`** Without it, an agent that finds the brief wrong will quietly build
  the wrong thing, because the brief is the only authority it has. With it, the contradiction comes
  back as a report instead of as code. This is the same instinct as the "a relayed authorization is
  not one" rule in PLAYBOOK §Human sign-off, pointed at facts rather than at permission.
- **Pre-assigned migration numbers (and every other globally-ordered id).** Already in PLAYBOOK's
  parallelization rules; restated here because it is what let this wave's lanes write 0025–0031 in
  one tree with no collisions, and because a lane whose migration sits *unapplied* while later
  numbers land is exactly the situation that makes
  [`../postgres-supabase/anchored-function-patch.md`](../postgres-supabase/anchored-function-patch.md)
  mandatory rather than stylistic.

### What this kit does NOT buy you
Zero merge conflicts is a statement about **files**, not about **correctness**. The same wave still
produced a notification kind that existed in one layer and not the other, a rate limit that counted
resettable rows, and 95 minutes spent on a gate that could not have passed. Disjoint ownership
prevents *clobbering*; it does nothing about a lane being wrong inside its own files. Close with the
§4b seam pass, a real round-trip, and the cross-layer gates —
[`../verification/cross-layer-enum-contract-gate.md`](../verification/cross-layer-enum-contract-gate.md).

*Source: the SentinelBox v1.1.0 run + the Flavor News craft level-up (conductor orchestration); reinforced by memory `parallel-wave-contract-seams` and `redesign-integration-playbook`. No single source file — this is the process the conductor runs. §5 added from the Whyza reposts wave (`docs/CONTRACT.md`, `docs/API-SEAM.md`, 2026-09-06).*
