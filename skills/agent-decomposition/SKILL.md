---
name: agent-decomposition
description: Decompose or design any agent with the tool-vs-skill-vs-subagent framework (Anthropic, Code with Claude 2026). Use when building a new agent, when an agent's prompt/tools have accumulated and quality dips, when a subagent-to-orchestrator handoff loses information, or when an agent is slow/expensive. Also covers eval hill-climbing, routines (async automations), and queue reliability guarantees.
origin: Code with Claude 2026 — "Tool, skill, or subagent?" workshop + Boris Cherny keynote demo. Full transcripts: knowledge/code-with-claude-2026-transcripts.md
tools: Read, Write, Edit, Bash, Grep, Glob
---

# Agent Decomposition

An agent that "outgrew its prompt" fails in predictable ways. This skill is the repair/design method: put each responsibility in its right home — **tool (compute) · typed contract (schema) · skill (policy/format) · subagent (isolated reasoning) · separate service (out of scope)**.

## When to activate
- Designing a new agent (product feature or studio agent) — apply from the start.
- An existing agent's evals/quality dipped after capability was bolted on over time.
- A long system prompt (>~100 lines) full of policies, formats, and edge rules.
- An orchestrator parsing numbers/ids/decisions out of a subagent's prose.
- An agent that is correct but slow or token-expensive.

## 1. Diagnose — map every failure to one of three causes
1. **Compute-over-context violation** — the model is doing work code should do (scanning a data dump, arithmetic, filtering, sorting). *Signature:* raw rows/files in context; winding multi-tool paths to a simple answer; timeouts; token blowups.
2. **Missing typed contract** — output shape improvised per run. *Signature:* orchestrator regex-parses prose; "fairly confident" where 0.71 was needed; downstream code branches on freeform text.
3. **Missing policy-as-skill** — business policy/format re-derived every call from a bloated prompt. *Signature:* contradictory prompt sections; format drift; the model pulls the right data then applies the wrong rule (anchoring).

Also ask the **scope gate**: does this capability belong in this agent at all? If it's a stub or a different domain (e.g. web/news monitoring inside an inventory agent), extract it to a separate service/agent.

## 2. Rebuild — placement rules
- **System prompt (~50 lines):** only what the agent needs on EVERY task — identity, non-negotiable guardrails, routing hints. Nothing task-conditional.
- **Skills (progressive disclosure):** each policy/procedure/format = one `SKILL.md` with a tight frontmatter description (~50 tokens standing cost; body loads only when the task matches). The skill body IS the policy — versioned, testable, single-sourced. Never duplicate it back into the prompt.
- **Tools = compute only.** A tool returns the exact, compact answer (top-N as JSON), never a dump for the model to scan. If it's ≤3 lines of scripting, don't define a tool — use bash/Python inline. **Human-primitives first:** start from file system + code execution + web search + todo list (Claude Code / CMA built-ins give these free); add custom tools only where primitives can't reach (real external writes: ERP, Stripe, DB). Remove primitives as needed, rather than authoring a bespoke tool per verb.
- **Subagents:** only for genuinely separate reasoning in an isolated context window. Every subagent returns a **pinned JSON contract** (e.g. `{units: int, confidence: float, assumptions: string[]}`) validated at the boundary — retry on schema mismatch. Never prose. Kill "subagent-hiders" (tools that secretly wrap a full agent round-trip and return prose) and "trivial-write subagents" (a 3-line append doesn't need an agent).
- **External writes** (POs, emails, payments, posts) stay explicit, auditable actions — append to an outbox/journal, batch where possible, human sign-off where the studio requires it.

## 3. Verify — eval hill-climbing (never decompose blind)
- Baseline BEFORE changing anything; then one structural change → redeploy → re-run → compare. Use Claude Code itself to run evals and triage failure themes (high effort setting; let it group failures into the three causes above).
- Suite shape (StockPilot reference): ~12 tasks · regression (R) single-turn + failure-mode (F) multi-turn · grader mix: `exact_match`, `set_match`, `action_taken`, `numeric_tolerance ±%`, `llm_judge` (structure/tone), `composite` (action + wall-clock + ranked output), **`efficiency` (out-token / cost budget)**. Track deterministic metrics (turn count, latency, tokens) over time, not just pass/fail.
- Include at least one **cost eval** ("what do 10 routine runs cost?") — efficiency is a graded feature, not a vibe. Score formula example: `(PASS + ½·PASS-SLOW) / N`.
- Studio wiring: eval-master owns the suite; append every run to `evals/scores.js` per PLAYBOOK.

## 4. Async layer — routines ("have Claude prompt Claude Code")
- A **routine is a higher-order prompt**: schedule / webhook / API-trigger creates the session; you write the routine, not the prompts. Wake up to PRs, not prompts.
- Verification unlocks async: the agent must check its own work (drive the real UI/browser, run the tests) before calling a task done — then it can run unattended.
- Standing routine patterns worth cloning: issue-watcher → opens PRs overnight · **CI auto-fix babysitter** (auto-fix review comments + CI, auto-rebase, diagnose flake vs real, fix root cause — owner never sees a red X) · scheduled content/lead-gen/monitoring loops. Studio owner: automation-engineer.

## 5. Reliability bar for any queue/cron/worker we ship (HILBERTOS guarantees)
Any Elevare job runner (fulfillment cron, site-builder worker, social queue, future routines) must provide:
- **At-least-once execution, no silent task loss** — jobs are leased (TTL), not just claimed; expired leases requeue automatically (dead worker ≠ lost job).
- **Retry queue with backoff + dead-letter** — failed jobs retry on policy; exhausted jobs land somewhere a human sees, never vanish.
- **Event journal** — append-only record of every state transition (accepted → dispatched → completed/failed/requeued) for audit + replay/debug.
- **Heartbeat + staleness alerting** — workers report liveness; a dead/stale worker raises an alert instead of silence.
- Lifecycle to implement: submit → select worker → dispatch (lease) → execute → result/ack → retry/failure handling.

## Checklist (run on any agent you touch)
- [ ] Prompt ≤ ~50 lines of always-true content; everything task-conditional moved to skills
- [ ] No tool returns a raw dump; compute happens in code, answers return compact + typed
- [ ] Every subagent/step feeding code returns validated JSON (contract pinned in its brief)
- [ ] No subagent-hiders, no trivial-write subagents, scope gate applied
- [ ] Eval baseline exists; every change re-evaluated; ≥1 efficiency eval
- [ ] Recurring work moved to a routine with self-verification
- [ ] Any queue involved meets the five reliability guarantees
