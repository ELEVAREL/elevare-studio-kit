---
name: fleet-scheduled-failover
description: You are about to run the same scheduled job on more than one machine — a cron/timer/agent routine placed on several always-on hosts for redundancy, or moved from a laptop onto servers with a fallback tier. Run this FIRST. Redundant schedulers double-run by default, and the two mechanisms that stop them (a shared lease and a per-host role) both fail silently in ways that look fine: window keys computed in different timezones can never collide, and a "primary" that lacks the repos, keys or CLI to finish the job still claims the window and then does half of it. Use when adding a host to a schedule, changing which host is primary, or diagnosing a routine that runs twice or not at all.
origin: Elevare Studio — moving six studio routines onto a 4-tier always-on fleet, where the lease had been silently inert across timezones (2026-09)
owners: devops-engineer, automation-engineer, delivery-lead, retrospective, cto-portfolio, chief-of-staff
---

# Fleet scheduled failover — exactly once, in the order you meant

## The shape that works

Four things, in this order. Skip any one and you get double-runs or silent gaps.

1. **A shared lease** keyed on `(job, window)`. First host to claim it runs; the rest skip.
2. **One window namespace.** Every host computes the key in **UTC**. Non-negotiable — see below.
3. **Staggered cron offsets** — `:00`, `:06`, `:12` — so the *order* is real rather than a race.
4. **A role per host** (`primary` / not) used only as the tiebreak when the lease itself is
   unreachable: primary runs, everyone else skips. Never two primaries.

The lease decides *who*; the offsets decide *who gets first refusal*; the role decides what
happens when the lease is down. Different jobs, all four needed.

## ★ The timezone trap — the failure that hides longest

A window key built from **local** `date` puts each host in a different namespace:

```
same instant:  EDT host -> 2026090222
               UTC host -> 2026090302
```

Those claims can never collide. Every host wins its own window and **every host runs every
job**, forever, while the code looks correct and each host's log says it claimed cleanly.
There is no error to find.

Pin it at the source of truth the runner already loads:

```bash
# routines.env, sourced with `set -a` BEFORE the window key is computed
TZ=UTC
```
```powershell
$now = [DateTime]::UtcNow      # NOT Get-Date, which is local
```

And pin the scheduler too, or the offsets you designed drift hours apart across hosts:

```
CRON_TZ=UTC     # first line of the crontab on any non-UTC host
```

**Prove it, don't assume it.** Print the key from every host in one command and read the
three strings side by side:

```bash
ssh $h 'set -a; . routines.env; set +a; date +%Y%m%d%H'
```

Then force a real collision: run the job by hand on a non-primary host and require the
output `another host owns window <key>`. A lease you have not watched *lose* is not a lease.

## ★ Capability-aware routing — a primary that cannot finish the job is worse than no primary

The lease makes the winner exclusive. If the winner cannot do the work, **nobody does it**,
and the losers skip believing it was handled.

Before promoting a host, check the job's actual dependencies on it — not the host's general
health:

```bash
for t in gh git python3 curl node jq; do printf '%-8s %s\n' "$t" "$(command -v $t || echo MISSING)"; done
ls ~/workspace                     # the repos the job edits
```

A container staged months ago typically has the runtime and the prompts but **not** the
repos, the `gh` CLI, or the deploy keys. Split the schedule by capability:

- portable jobs (probes, research, drafting) → the host you want primary
- jobs needing repos/credentials → the host that has them goes **first**, others behind it

Offsets are per-job, so this needs no role changes — just put the capable host at `:00` for
those jobs and say so in a comment in the crontab.

## The last-resort tier

A laptop or workstation is a legitimate final tier, with two conditions:

- It must go **through the same lease** — an app-level scheduler that runs the prompt
  directly bypasses the lease entirely and double-runs everything the fleet just did.
- Default it to **disabled**. Waking a full agent session every hour only to discover the
  servers already did the work is pure overhead on the machine the human is using. Leave the
  lease-safe command in the task so re-enabling is one switch, and say so in its description.

## Verifying the move

Do all five. Each has caught a real failure:

1. Fingerprint the credential on every host — a staged container usually holds a stale copy
   (`[[credential-drift]]`).
2. Run the job by hand on the new primary and read the log to the end. Exit 0 with a
   degraded-ledger line at the top is not success.
3. Run it on a non-primary and require the "another host owns window" skip.
4. Print the window key from all hosts and confirm the strings are identical.
5. Wait for one real scheduled tick and read the log the scheduler produced. Manual runs
   inherit your environment; cron does not — `PATH` is the usual casualty.

## Related

`[[credential-drift]]`, `[[calibrated-check]]`, `[[claim-reality-audit]]`, memory
`app-scheduled-tasks-replace-token-routines`, `claude-tokens-work-fleet-wide`.
