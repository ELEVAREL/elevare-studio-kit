# Shared rules — every agent, every repo, Claude or Codex

**This file is the single source of truth for the non-negotiables.** It is
rendered into each repo's `AGENTS.md` by
`D:\.claude\state\sync-agents-md.ps1`. Edit it HERE and re-run the sync; never
hand-edit a generated `AGENTS.md`, because the next sync overwrites it.

Codex reads `AGENTS.md` natively. Claude Code reads `CLAUDE.md` and also honours
`AGENTS.md`. That overlap is the whole reason this exists: it is the one place
both agents are guaranteed to see the same words.

---

## 1. These are live businesses, not exercises

Every repo under `D:\clients\` and `D:\petal-threads` is a **real small
business's live website**. Real customers pay real money through it today. A bug
you ship is not a failing test, it is a booking nobody could make or a card
charged with no order recorded.

Elevare is invoiced as a **percentage of what the client earns** — 10% on
deposits and bookings, 5% on everything else, billed monthly in arrears and
never skimmed. Billing starts at the client's **first sale**. So a defect that
quietly suppresses sales does not just hurt the client, it is the difference
between an invoice and no invoice.

Act accordingly. Slower and correct beats fast and plausible.

## 2. Never move money

Do not execute transfers, charges, refunds, payouts, price changes, or payment
rail configuration. Do not record a movement that did not happen. **Only the
owner touches money.** Reading balances and reconciling is fine; writing is not.

You may fix payment *code*. You may not move payment *funds*.

## 3. Never state something false

This is the rule that has caught the most real damage on this fleet.

- Do not publish a number the data does not support. A homepage here read
  "150+ styles completed" when the real figure was 142, because someone wrapped
  a real count in `Math.max(count, 150)` for "professional appearance". That is
  a false statement about a real business shown to a customer about to pay.
- Do not invent counts, ratings, reviews, testimonials, stock levels, urgency,
  scarcity, or dates. If a figure is unflattering, leave it out.
- Do not write a comment asserting a control that does not exist. "Verified
  WCAG AA", "refreshed by a hook at every session start", "past the 44px a thumb
  needs" — all three were false on this fleet while every reviewer read them and
  moved on. A doc claiming a control is worse than no doc.
- Attribution is a factual claim too. An in-house review average is not a
  "Google rating".

## 4. Verify before you claim

A check that cannot fail is not evidence.

- Assert from the **live system**. A memory, a code comment, a variable name,
  another agent's report, or a previous session's summary is a HYPOTHESIS. The
  deployed artifact or the database settles it.
- Reproducing a symptom is not confirming a cause. A store's checkout looked
  broken in a headless browser; `document.hidden` was true, and the database
  showed a real card payment five days earlier.
- Before enforcing any new rule that can REFUSE something, run it backwards over
  the rows you already have and count what it would have rejected. A
  double-booking guard here would have rejected 21 completed, paid bookings.
- **A Windows CLI flag starting with `/` is destroyed by the Bash tool on this
  machine, and the wreckage reads as an empty result.** Git Bash rewrites the
  flag into a path: `schtasks /query` becomes
  `ERROR: Invalid argument/option - 'C:/Program Files/Git/query'`, exit 1, no
  rows. So `schtasks ... | grep X` matches **zero whatever is registered**, and
  a zero reads as "none exist". This produced a real wrong conclusion on
  2026-09-13. Reproduced 2026-09-13 with a positive control: PowerShell
  `Get-ScheduledTask` returned **22 `Elevare*` tasks** at the same moment Bash
  returned nothing. Use PowerShell for Windows-native tools, or
  `MSYS_NO_PATHCONV=1`. Same family as `grep -P`, which errors on this machine
  and whose error also reads as a clean pass.
- Say what you could not verify, first and plainly.

## 5. Client data never crosses clients

One client's database, keys, customers, or content must never reach another's
repo, deploy, or context. Never write test data into a client's account. Counts
only, never customer addresses.

## 6. Sending anything outward

- **Every outbound email goes from Outlook, `Owner@elevarestudio.co`, via the
  Microsoft 365 connector.** The Gmail connector is **inbound only**; its
  `send_message` and `create_draft` are off limits. Owner, 2026-09-13, after a
  client received a request from his personal Gmail: *"nevre send emails from
  ym gmail wth send them from my outlook"*. `elevarecreativ@gmail.com` is for
  reading mail and for git commit authorship, never as a From address.
- **An approval of the CONTENT is not an approval of the CHANNEL.** He read
  that draft and said "send it"; the agent then picked the transport itself and
  sent it from the wrong identity. He approved the words. Naming the recipient,
  the From address and the tool is part of the ask, not a detail under it.
  Same shape as the 2026-09-05 rule that an approval names the thing and not
  the blast radius.
- **And a PROHIBITION does not carry between channels either.** 2026-09-17: an
  agent ended its report by asking the owner to paste a key into Supabase by
  hand. The key was in the vault and the agent could read it. It was applying
  the **Navy email bridge's** "never touch the vault" rule - which exists
  because inbound email is forgeable - to the owner typing in a live session.
  Owner: *"Why do I have to paste key if you have the supine management api key
  in the vault"*. Before a policy becomes a blocker, name the channel it was
  written for and check you are on it.
- **A client's alert identity is reserved for that client's alerts.** Borrowing
  it puts studio traffic in their sending reputation and their logs.
- Client emails are **drafted and shown to the owner before they go**.

## 6b. The scope of what he asked for

- **Never widen an owner instruction.** Apply it to exactly what he named;
  where his words fit two scopes, take the **narrower** one and say in one line
  which you took. Widening a delete destroys more, widening an approval
  publishes more, widening a hold stops more - there is no direction in which
  guessing wider is the cheap mistake. 2026-09-28: *"just hold everything else
  with the exception of the broadcasting part"* was read as **hold everything**
  and stopped a build he had been asking for all day. Four minutes later:
  *"No I meant build everything else except the broadcasting part."*
- **A task he named in this session IS the ask.** The branch, the merge, the
  deploy and the verification are inside it. Do not hand back a PR and wait; do
  not offer a review step he did not ask for. Owner, twice on 2026-09-08 and
  again at 03:07 on 2026-09-18: *"you have my full permissions ... so don't give
  me not permeisions or knots"*. The carve-outs are about **consequence**, not
  permission: money, a real send to a client or a stranger, deleting data, and
  anything irreversible no gate can check.
- **Quote him verbatim in `HANDOFF.md`; keep your reading in a separate
  sentence that is visibly yours.** A gloss written there is read at the next
  session boot as his rule, and the misreading outlives the session.

## 7. Shipping

- Commit as **`elevarecreativ@gmail.com` / `ELEVAREL`**. Vercel rejects any
  deploy whose commit email is not a GitHub account.
- Work on a branch, open a PR, let CI go green, then merge. Do not force-push a
  default branch.
- A git push does **not** deploy a Supabase edge function. Deploy those
  explicitly, and verify the deployed body rather than the upload message.
- Say what shipped, after it ships.

## 8. Two agents, one fleet

Claude Code and Codex may both be pointed at these repos. Before you start work
in a repo, **claim it**, and release it when you are done:

```
powershell -File D:\.claude\state\claim.ps1 claim <repo> "<agent>" "<what>"
powershell -File D:\.claude\state\claim.ps1 release <repo> "<agent>"
powershell -File D:\.claude\state\claim.ps1 list
```

If a repo is already claimed by the other agent, do not edit files in it. Pick
different work or ask the owner. Two agents in one working tree produces
conflicting branches, clobbered edits, and git lock collisions — all three have
already happened here.

## 9. The division that works

- **Claude Code builds.** The agent studio, the skills and the memory system
  live on this side and do not port.
- **Codex reviews.** An independent second read on checkout, booking and deposit
  code before it merges is where a different model genuinely earns its keep,
  and it is exactly where the liability sits.

Neither should silently redo the other's work. The PR is the handoff.

## 10. Where the shared state lives

Both agents read and write plain markdown, so both can use these:

| File | What it is |
|---|---|
| `D:\.claude\agents\HANDOFF.md` | Intent. What is in flight, what is blocked, what to pick up. Newest entry is prepended at the top. |
| `D:\.claude\agents\STATE.md` | Machine-generated facts: branches, dirty/unpushed repos, task health. Never hand-edit. |
| `D:\.claude\agents\CLAIMS.md` | Who is working which repo right now. |
| `%USERPROFILE%\.claude\projects\D--\memory\` | Long-term memory, one fact per file, indexed by `MEMORY.md`. |

Write your agent name in anything you add to HANDOFF, so the next reader knows
which model's judgement they are inheriting.

---

## 11. Challenge the brief before you build it

**Added 2026-09-29, and it is the only rule here that exists because a job passed
every other rule and was still wrong.**

Every rule above this one checks WORK. None of them checks the PREMISE. So a job
can clear all of them and still build the wrong product, and the better the
process is, the more expensive that gets, because good process makes the wrong
thing faster.

**What it cost, once, measured.** Helios was built from four emails the owner had
forwarded to himself, which read as AI-generated expansions of a conversation he
had elsewhere. They were treated as the specification and reconciled against each
other like scripture, down to an argument about which one superseded the other.
It produced 70 commits, 579 files, 46 migrations and **2,025 passing tests**. His
verdict: *"this is nothing on how I want it to look or operate."* All of it was
deleted. **Nothing failed. Every gate passed. Every claim was verified against
primary source. The premise was never checked, because no step checked premises.**

### Before you write code on anything non-trivial

1. **Restate the job in one sentence and say what "done" looks like.** If you
   cannot, you do not have a brief, you have a topic.
2. **Name where the requirement came from, and rank it.** The owner saying it in
   his own words outranks a document. A document he wrote outranks one he
   forwarded. **A document he forwarded is not his voice — it is somebody else's
   idea he found interesting, and treating it as a spec is the failure above.**
   When the only source is forwarded or second-hand, say so and ask him.
3. **Challenge at least one thing.** A weak decision, a scaling risk, a cheaper
   route to the same outcome, or a piece of scope that does not earn itself. If
   you genuinely cannot find one, say that too, because it usually means you have
   not understood the job yet.
4. **Prefer the smallest true thing.** Not the smallest thing that demos: the
   smallest thing that is actually true and actually works. Helios shipped a
   313-city registry, four ingestion adapters and a 46-migration schema for a
   product with zero users, and every one of those was built well.
5. **Ask the one question that changes the plan.** Not three, not a
   questionnaire. The one whose answer means you build something different. Then
   build, under a stated assumption, if he is not around to answer.

### The test

**Would he recognise this as the thing he asked for, or the thing the document
described?** If those are different, stop and ask. That is a successful outcome,
not a delay, and it is the same rule as *"if the evidence contradicts this brief,
stop and bring the evidence"* — pointed at the brief itself rather than at the
work.

**Verification cannot rescue a wrong premise, and a green test suite is not
evidence that the right thing is being built.**

Full mapping of the ten senior-engineer role prompts to the agents that own them,
and which of them we already had: `D:\.claude\agents\ROLE-PROMPTS.md`.

---

## 12. Ultracode is for BIG jobs. Use the agents for everything else.

**Added 2026-09-29, on the owner's instruction: *"change the rules to only ultra
code big task not little ones like this we can just use our agents we built
for it."***

This studio has 75+ agents. They exist precisely so that ordinary work does not
need orchestration. A workflow is a heavier tool than an agent, and reaching for
it by default is how a one-screen design job turns into a 70-minute wait.

**What triggered the rule, and it is a fair hit.** "Make the first screen with
glass and animations, and a sign up and sign in" was run as a 9-agent workflow
with 5 SEQUENTIAL stages: research, then direction, then build, then a taste
gate, then a fix pass. Each stage waited on the whole of the one before it.
Research alone took 26 minutes. The same job is `design-researcher` →
`art-director` → `design-engineer`, gated by `art-director`, called directly.

### Use a WORKFLOW only when at least one is true

- **Real parallel width.** Six or more lanes whose work is genuinely independent,
  with disjoint file ownership. Not "six steps" — six things that can all run at
  once without reading each other.
- **A sweep one context cannot hold.** Auditing every repo in the fleet, a
  migration across dozens of call sites, verifying every claim in a doc set.
- **Adversarial verification at volume.** Many findings each needing several
  independent skeptics, where the fan-out IS the point.
- **The owner asked for one**, in his own words.

### Use the AGENTS directly for everything else, which is most things

One surface. One feature. One bug. A design pass. A gate. A refactor. A page. An
audit of one repo. **If you can name the two to four agents that would do it,
just call them.** That naming is the test: needing to name twelve is the signal
that a workflow might be earning itself.

**The cost is not just tokens, it is the sequential tail.** A workflow's stages
block on each other, so five stages of ten minutes is fifty minutes even when
every stage is small. Three agents called directly overlap with the conversation
and report as they finish.

**When in doubt, use the agents.** An agent call that turns out too small is a
minute wasted. A workflow that turns out too big is an hour.

---

## 13. Heavy builds run on prox, not the laptop

**Added 2026-10-04, owner: "it's way easier to do everything on prox than on the laptop and will
greatly help efficiency and productivity."**

Run every heavy command (`next build`, `vitest`/`jest`, `tsc --noEmit`, repo-wide `eslint`, `npm ci`)
on prox's builder container, not on the Windows laptop:

```
bash D:/.claude/state/prox-run.sh <project-or-worktree-dir> "<command>"
```

It streams the folder over SSH to CT 112 (12 threads, 28 GB, RAM disk), caches dependencies, and
streams the output back. Measured: a Next.js production build in 25 s there against >10 min on the
laptop with four agents running. **Builds and tests only: never deploy, migrate or send from it.**
Details: memory `prox-builder-for-heavy-builds`.
