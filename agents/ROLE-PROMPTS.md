# Role prompts — the ten senior-engineer modes, mapped to the studio

**Source:** the owner sent ten prompt cards (@ai_slacker on TikTok, numbered 2 to 11) on 2026-09-29
with the instruction *"Put these into the rules if we don't already use them and incorporate them
into the Elevare flow so both subscription accounts use them."*

This file is the answer to "do we already use them". It is honest about the score: **nine of the ten
were already a named agent in this studio. One was not, and the one that was not is the exact defect
that cost five days of work on Helios the day before these arrived.**

Nothing here replaces an agent. The value of a role prompt is the *stance* it puts the agent in, and
the stance is what the roster names did not carry. So each row below binds the prompt's language to
the agent that already owns the work.

---

## The score, stated plainly

| # | The card | Already ours? | Owner |
|---|---|---|---|
| 2 | Audit an unfamiliar codebase, reverse-engineer architecture and data flow | **YES** | `codebase-navigator`, and PLAYBOOK §2 already routes to it **first, always**, before any change |
| 3 | Production debugging: trace root cause, *"Do not guess. Verify assumptions"* | **PARTLY** | No debugging agent exists. STANDARDS §Verify carries the discipline; see the note below |
| 4 | Performance engineer: bottlenecks, rendering, memory | **YES** | `performance-engineer` |
| 5 | Refactor messy code to clean architecture, preserve behaviour | **YES** | `code-quality-engineer` (its brief already says "without changing behavior") |
| 6 | Architect a startup backend, minimal implementation that can scale | **YES** | `backend-engineer` + `database-architect`, planned by `product-strategist` |
| 7 | Four agents in sequence: Architect, Engineer, Reviewer, Optimizer | **YES** | This is the PLAYBOOK loop with `delivery-lead` conducting. We fan out in parallel rather than run strictly sequential, and §4b's seam pass is the barrier the card's "sequential" is reaching for |
| 8 | Senior frontend: component architecture, loading/empty/edge states, a11y | **YES** | `frontend-builder`, `design-engineer`, gated by `design-auditor` |
| 9 | **Tech lead mode: clarify requirements, CHALLENGE weak decisions, before coding** | **NO. THIS IS THE GAP** | Now SHARED-RULES §11. See below |
| 10 | Production security audit: vulns, attack scenarios, fixes | **YES** | `security-reviewer`, a mandatory gate in PLAYBOOK §5 |
| 11 | DevOps: infra, CI/CD, monitoring, downtime prevention | **YES** | `devops-engineer` + `launch-engineer` |

---

## #9 is the one that matters, and here is why

The card says: *"Before coding, clarify requirements, challenge weak decisions, identify scaling
risks, suggest better approaches, and prioritize simplicity... Think like a tech lead maintaining and
scaling this product for 5+ years, not just generating code."*

**Measured, 2026-09-29: `grep -rniE 'challenge (the )?(brief|weak|decision)|push back|clarify
requirements before' D:\.claude\agents\*.md` returned NOTHING.** The studio had eight documents about
verifying work, a brief protocol with five fields, a handoff protocol with six, and not one line
telling an agent to question whether the thing being asked for is the right thing.

**What that cost.** Helios was built from four emails the owner had forwarded to himself, which read
as AI-generated expansions of a conversation. They were treated as the spec and reconciled against
each other like scripture, including an argument about which superseded which. The result was 70
commits, 579 files, 46 migrations and **2,025 passing tests**, and the owner's verdict was *"this is
nothing on how I want it to look or operate"*. All of it was deleted.

**Nothing in the process failed.** Every gate passed. Every claim was verified against source. The
premise was wrong, and this studio has no step that checks a premise — only steps that check work.
**Verification cannot rescue a wrong premise, and a passing test suite is not evidence that the right
thing is being built.**

That is now SHARED-RULES §11, in the file that renders into every repo's `AGENTS.md`, so both
subscription accounts and Codex all read it.

---

## #3, the honest partial

There is no debugging agent. `codebase-navigator` maps a codebase, `qa-verifier` proves a flow works,
and neither is "something is broken in production, find out why without guessing."

The card's operative line is **"Do not guess. Verify assumptions and fix the underlying cause."**
That is already STANDARDS §Verify and the calibrated-check discipline, and this session produced four
textbook cases in one day: a bash heredoc ate a variable so sixteen probes returned 400 *identically*,
which is the signature of a broken check rather than sixteen broken services; a regex looked for
`domain` when the key was `host`; a grep of served HTML could not see a client component in a JS
chunk, and its own control did not fire either, so it proved nothing in **both** directions.

**The rule worth carrying from all four: a check whose control does not fire is not evidence, in
either direction.** A uniform failure across many independent targets is nearly always the harness.

Whether that becomes an agent is `agent-architect`'s call, not this file's. Recorded as a candidate.

---

## How to use a role prompt

Paste the card's language into the agent's brief when the job matches. It is a stance, not a
process, and it does not override anything: SHARED-RULES, STANDARDS, CRAFT and the PLAYBOOK gates all
outrank it. Where a card conflicts with a house rule, the house rule wins and the conflict gets
written down here.

**One card is already known to conflict.** #6 says *"build the minimal implementation that could
realistically scale in the future"*, and #7 says *"Build it like a real engineering team preparing a
startup product for scale."* Both point at speculative scale. STANDARDS and the Helios reset both
point the other way: **build the smallest true thing, and do not build for a scale nobody has.**
Helios shipped a 313-city coverage registry, four ingestion adapters and a 46-migration schema for a
product with zero users. When these conflict, **simplicity wins** — which is what #9 itself says, and
#9 outranks the other nine.
