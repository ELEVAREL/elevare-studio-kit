---
name: claim-reality-audit
description: You are about to act on a written claim — a line in a plan, a memory, a HANDOFF or STATUS doc, a README, a comment, a previous session's summary, or your own earlier message — that says something is broken, dead, unused, disabled, revoked, or safe to delete. Run this FIRST. Docs record what was true when someone wrote them; systems keep moving. Use before any prune, retirement, migration, or "we already know X" shortcut, and whenever a plan item begins "since X is no longer used".
origin: Elevare Studio — a prune plan whose premise was wrong on 3 of 4 items, and a memory that sent a session on a five-hour detour minting a token that already worked (2026-09)
owners: retrospective, memory-curator, devops-engineer, delivery-lead, cto-portfolio, chief-of-staff, codebase-navigator, docs-writer, pattern-librarian, ceo-advisor
---

# Claim–reality audit — a documented claim is a hypothesis with a timestamp

## The rule

**Every written claim about system state is a hypothesis. Test it against the live system
before you act on it — especially when acting means deleting something.**

The doc was true when written. That is the whole problem: it reads exactly like a fact.

## The two failures this prevents

**Destroying something that works.** A prune plan said four containers were idle leftovers.
Three of them were doing real work on live timers; only one was genuinely dead. Executing
the plan as written would have taken down monitoring on three hosts — and the plan would
still have "succeeded".

**Rebuilding something that was never broken.** A memory said every headless token had been
revoked. True on the day it was written, fixed nine days later, never corrected. Acting on
it burned a session on a replacement token for a credential that answered on the first try.

Same root cause, opposite direction. Both are cheap to prevent and expensive to undo.

## The audit — evidence of behaviour, not evidence of configuration

For each claim, name the observation that would falsify it, then go get it.

1. **Convert the claim to a falsifiable prediction.**
   "CT 110 is unused" → "no process, no timer, no file written in 14 days."
2. **Prefer evidence of *execution* over evidence of *existence*.**
   A cron entry is not proof a job runs. A unit file is not proof a service works. A
   `systemctl is-enabled` is not proof of a process — `disable` does not stop anything,
   and `Restart=always` will bring it back about 30 seconds after you kill it. To stop a
   thing for real: **mask first, then kill.**
3. **Ask what has changed since.**
   ```bash
   find /var/log /opt /home /srv -type f -newermt '-14 days' | grep -v <noise>
   journalctl _COMM=cron --since -14d | grep -c CMD
   ```
   Silence in the last 14 days is a finding. Recent writes falsify the claim outright.
4. **Test the credential / endpoint / service directly** when the claim is about one. Two
   seconds of the real call beats any amount of documentation.
5. **Write the verdict back into the doc, dated.** `~~claimed X~~ **CORRECTED <date>:** …`
   with what you observed. An uncorrected claim will be believed again — by you.

## Before deleting anything

- Confirm what *currently* references it (`grep -r`, the scheduler, the reverse proxy).
- Preserve the recovery path: rename rather than remove, keep a copy, note the restore
  command. Cost of keeping a renamed unit: nothing. Cost of a wrong delete: an outage plus
  a rebuild.
- If it turns out to be alive, **the deliverable is the corrected claim**, not the deletion.
  Reporting "3 of 4 were wrong, here's the evidence" is a better outcome than executing.

## When the claim is your own earlier statement

The same rule applies, with one addition: say the correction plainly, once, in the sentence
where it matters, and continue. Do not re-audit statements that were accurate — a follow-up
question is not evidence you were wrong.

## Related

`[[calibrated-check]]` (prove a passing check can fail), `[[credential-drift]]` (a claim
about a secret is the most common stale claim), memory `memory-system-architecture`
(STATE.md holds machine-generated facts; HANDOFF holds intent — when they disagree,
regenerate STATE.md and believe the live system).
