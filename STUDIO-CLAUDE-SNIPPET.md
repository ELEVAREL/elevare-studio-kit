# Elevare Studio — agent team

This machine has a reusable **agent studio** at `~/.claude/agents/` (agents + operating docs, available in every Claude Code session) and a skills library at `~/.claude/skills/`. Use it for real work instead of reinventing a process each time.

## When to use it
For any **product / website / app / feature / redesign / marketing / content / launch / audit** task (anything beyond a trivial one-off question or a two-line edit):

1. **Read `~/.claude/agents/PLAYBOOK.md` first** — it defines the flow (intake → triage → plan → execute → gate → ship → measure → **learn**) and a concrete playbook per job type.
2. **Act as the conductor:** `delivery-lead` for product/technical/build work, `marketing-strategist` for marketing/content/campaigns. Decompose the job, route each piece to the right specialist agent, run independent work in parallel.
3. **Invoke agents by name** via the Agent tool (`subagent_type: "<name>"`) — they register from `~/.claude/agents/`. Full roster + org chart in `README.md`.
4. **Hold the gates before shipping:** code-quality, test-engineer, design-auditor, security-reviewer, qa-verifier, performance-engineer, + the art-director taste gate. Never merge to `main`, deploy to production, publish, send, or spend budget without explicit human sign-off.
5. **Close with the `retrospective` agent** — it encodes what was missed back into the agents/standards so the team compounds each run.

## Always follow
- `~/.claude/agents/STANDARDS.md` (house quality bar) and `CRAFT.md` (top-tier visual bar).
- `~/.claude/agents/SKILLS-MAP.md` routes the installed skills (`~/.claude/skills/<name>/SKILL.md`) to the owning agents.
- Never put a secret, or even a truncated fragment of one, in a tracked file, doc, or report.
