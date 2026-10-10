# Read-only multi-gate audit fan-out with a shared constraints brief

**When to reach for it:** the conductor (delivery-lead / marketing-strategist) needs to run several review gates in parallel over the *same* artifact — security, a11y, perf, code-quality, taste — and wants the findings to stay **in-constraint** (no gate proposing changes that violate the project's hard rules, no gate mutating files mid-review). This is the orchestration shape that keeps a fan-out audit useful instead of a pile of contradictory, out-of-scope suggestions.

**Assumes / adapt:** this is a *process/prompt* pattern for the conductor, not code. It fits any multi-gate review (the GATE step of the PLAYBOOK). The key move is the **shared constraints brief** handed identically to every gate, plus **read-only** framing so the wave can run truly in parallel without file collisions.

## The shape

1. **Write one constraints brief, once.** Before fanning out, the conductor writes a short brief every gate receives verbatim:
   - **Invariants (do not violate):** e.g. "stays 100% offline — no network calls, no CDNs", "single-file app, no build step", "dark theme, AA contrast", "no new dependencies".
   - **What's in scope for this gate wave** and what's explicitly out of scope (so gates don't re-litigate settled decisions).
   - **The artifact + how to inspect it** (file paths, how to run/preview) — enough that each gate acts cold.
   - **Output contract:** every finding must be `{severity, location, what's wrong, why it violates a standard/invariant, the minimal in-constraint fix}`. A finding that would break an invariant is itself a defect — flag the tension, don't silently propose it.

2. **Fan out read-only.** Each gate **reads and reports only** — it does not edit files during the audit. This is what makes the wave safely parallel (no worktree isolation needed for a read-only wave) and keeps every gate looking at the same untouched artifact. Fixes are applied *after* reconciliation, sequentially, by the owning agent.

3. **Reconcile before fixing.** The conductor collects all reports, then:
   - **Dedupes** convergent findings (multiple gates flagging the same line).
   - **Resolves conflicts** where two gates want opposite things — the invariant wins; if neither is an invariant, the conductor decides and records why.
   - Produces one ordered fix list.

4. **Apply sequentially, then re-verify.** Fixes go in one at a time (or in isolated worktrees if parallelized), then the relevant gate re-checks its own findings on the changed artifact.

## Why it works
- The **shared brief** is the single source of "what's allowed" — gates can't drift out of constraint because the boundary was stated identically to all of them.
- **Read-only fan-out** removes the coordination cost of parallel review: no file collisions, every gate sees the same input, results are comparable.
- **Reconcile-then-fix** prevents the thrash of gates fixing over each other and surfaces cross-gate conflicts as an explicit decision instead of a silent last-writer-wins.
