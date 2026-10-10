---
name: canary-watch
description: Use this skill to monitor a deployed URL for regressions after deploys, merges, or
  dependency upgrades, and to audit any monitor/sensor/alert that has no recovery path — an alarm
  that stays lit after the condition is fixed, a stale CRITICAL, an alert nothing ever clears.
origin: ECC
---

# Canary Watch — Post-Deploy Monitoring

## When to Use

- After deploying to production or staging
- After merging a risky PR
- When you want to verify a fix actually fixed it
- Continuous monitoring during a launch window
- After dependency upgrades

## How It Works

Monitors a deployed URL for regressions. Runs in a loop until stopped or until the watch window expires.

### What It Watches

```
1. HTTP Status — is the page returning 200?
2. Console Errors — new errors that weren't there before?
3. Network Failures — failed API calls, 5xx responses?
4. Performance — LCP/CLS/INP regression vs baseline?
5. Content — did key elements disappear? (h1, nav, footer, CTA)
6. API Health — are critical endpoints responding within SLA?
```

### Watch Modes

**Quick check** (default): single pass, report results
```
/canary-watch https://myapp.com
```

**Sustained watch**: check every N minutes for M hours
```
/canary-watch https://myapp.com --interval 5m --duration 2h
```

**Diff mode**: compare staging vs production
```
/canary-watch --compare https://staging.myapp.com https://myapp.com
```

### Alert Thresholds

```yaml
critical:  # immediate alert
  - HTTP status != 200
  - Console error count > 5 (new errors only)
  - LCP > 4s
  - API endpoint returns 5xx

warning:   # flag in report
  - LCP increased > 500ms from baseline
  - CLS > 0.1
  - New console warnings
  - Response time > 2x baseline

info:      # log only
  - Minor performance variance
  - New network requests (third-party scripts added?)

clear_policy:  # REQUIRED — every tier above must name how its alarm ends
  critical: two consecutive passing checks on the same URL -> mark resolved
  warning:  one passing check -> mark resolved
  info:     next check supersedes it
```

A tier with no `clear_policy` entry is not a conservative default, it is the bug in
**When the Alarm Must End** below: the alert outlives the condition and the dashboard
lies about a system that is already healthy.

### Notifications

When a critical threshold is crossed:
- Desktop notification (macOS/Linux)
- Optional: Slack/Discord webhook
- Log to `~/.claude/canary-watch.log`

## Output

```markdown
## Canary Report — myapp.com — 2026-03-23 03:15 PST

### Status: HEALTHY ✓

| Check | Result | Baseline | Delta |
|-------|--------|----------|-------|
| HTTP | 200 ✓ | 200 | — |
| Console errors | 0 ✓ | 0 | — |
| LCP | 1.8s ✓ | 1.6s | +200ms |
| CLS | 0.01 ✓ | 0.01 | — |
| API /health | 145ms ✓ | 120ms | +25ms |

### No regressions detected. Deploy is clean.
```

## When the Alarm Must End

A canary that can raise an alert and never lower it is worse than no canary: after the
first stale CRITICAL, the owner stops reading the dashboard. This is the inverse of a
false green — nothing is misreported as success; a **recovery is never reported at all**.

**The one-line cause.** `if findings: record(...)` reads as an optimisation ("nothing to
write, skip the write"). It is the recovery signal being discarded. Auto-resolution lives
inside `record()`, so recording *nothing* leaves the original event open permanently.

```python
# WRONG — the cured condition alarms forever (core/clients.py:290 and :322)
if findings:
    record("core", findings)

# WRONG — same bug, ternary spelling (prospect-engine/engine.py:1381)
fresh_events = record(SYSTEM, findings) if findings else []

# WRONG — same bug, early-return spelling (client-reports/report.py:642)
if args.no_events or record_fn is None or not queue:
    return []

# RIGHT — an absent finding IS information: it says the condition ended
record(SYSTEM, findings, sweep_scope={"kinds": LIVE_CONDITION_KINDS})
```

> **Which half of this is verified.** The three WRONG shapes are live in
> `D:\elevare\Elevare-Ops` right now and are reproduced above from that source. The RIGHT
> shape is **not**: the `sweep_scope` parameter and the auto-resolution inside `record()`
> are the **deployed** eventstore's API, fixed on the box 2026-08-22 (memory
> `alarm-with-no-recovery-path`). The checkout on this drive predates it —
> `record.__code__.co_varnames` is `('system', 'findings')`, so the RIGHT call is a
> `TypeError` here until the deployed fix is synced back. Executed 2026-09-06 against that
> checkout: record one CRITICAL, cure the condition, call `record(system, [])` anyway —
> the event is still `status: "new"`. Unconditional reporting is necessary but **not
> sufficient**; the store must implement the sweep too.

### Four rules for any reporter whose findings represent a live condition

1. **Report unconditionally, empty list included.** The empty call is the only thing that
   can close what the full call opened.
2. **Scope the sweep to kinds emitted *only* while the condition is live.** Absence of a
   point-in-time event (a delivered webhook, a fraud warning) means nothing; absence of a
   live-condition kind (`*_unavailable`, `*_unreachable`, `*_mismatch`) means recovered.
   Sweeping the wrong kinds resolves alarms that were never cured.
3. **Verify by STATUS, not by absence.** A correctly swept finding becomes
   `status: resolved`; it does **not** disappear. If it vanished from the store, something
   deleted it — that is a different bug, and a worse one.
4. **The sensor must actually have run.** A sweep is only allowed to conclude "recovered"
   on a run that reached its source. A blind run must refuse to sweep (exit blind, don't
   exit 0 — see `deployed-credential-goes-stale`).

### Two traps that hide the bug from a reviewer

- **Scope that doesn't cover its own finding.** `spend-watch` declared
  `BLIND_KINDS = {"spend_check_unavailable"}` and emits `spend_registry_unavailable`
  (`spend-watch/sensor.py:861`). The sweep ran and silently no-opped. **Check that every
  kind the sensor can emit appears in the scope**, by grepping the emitted `"kind":`
  literals, not by reading the constant.
- **A sensor that never re-ran.** `churn-radar` self-throttles
  (`churn-radar/sensor.py:582`, `MIN_INTERVAL_HOURS` default **12** as of 2026-09-06;
  recorded as ~4h on 2026-08-22) and exits quietly, so it needs `--force` for a manual
  check. **A sweep that never executes looks exactly like a sweep that found nothing.**
  Prove the run happened before you believe its silence.

### The audit — run it, don't read it

**Step 1 — find the emptiness guards** (high precision; on `D:\elevare\Elevare-Ops`
these two return the 4 real instances and no false positives — note they correctly do
*not* flag `upsell/sensor.py:540`, whose `if not selfcheck:` is a mode guard, not an
emptiness guard):

```bash
# guard wrapped around, or ternaried onto, the report call
rg -n -B3 --no-heading -g '!**/tests/**' -g '!**/test_*' 'record\(' --glob '*.py' | rg 'if (not )?[a-z_]*(findings|queue|alerts|issues|rows|claims)[a-z_]*\s*[:)]|if [a-z_]+ else \[\]|len\([a-z_]+\) > 0'

# early return on empty, scoped to functions that actually report
rg -n -U --multiline-dotall -g '!**/tests/**' -g '!**/test_*' --glob '*.py' 'if [^\n]*\bnot (findings|queue|alerts|issues|rows|events)\b[^\n]*:\n\s*return[^\n]*\n(?:[^\n]*\n){0,4}?[^\n]*(record|\.insert\()'
```

Both are one-liners on purpose: a `\`-continuation inside a `\n`-bearing regex is the
first thing another tool mangles when this block is copied out.

Drop the `{0,4}?` reporter scope and the second pattern goes from **1 match in 1 file to 7
matches in 5 files** — the extra 6 are data-fetch helpers returning early on an empty
query, which is correct code. Keep the scope: a check that is always red is a check
nobody reads.

**Step 2 — for SQL/edge-function alerts, locate every alert write, then ask two
questions.** No regex decides this; the grep only finds the candidates:

```bash
rg -nU 'from\("<alerts_table>"\)[\s\S]{0,120}?\.(insert|update)' supabase/functions
```

- *Does this row represent a live condition, or a point-in-time event?* Event rows
  (`early_fraud_warning`, a delivered webhook) legitimately have no clearing path.
- *What UPDATEs it on the **empty** result?* An update that only runs **inside** the
  per-item loop or inside the `if (found.length > 0)` block is not an answer — it never
  executes on a clean run. No answer outside that block = this trap.

Worked example — that command over Fanta's `supabase/functions` returns 4 writes in 2
functions, and the two questions give three different verdicts, which is the point:

| Write | Verdict |
|---|---|
| `refund-reconcile:155` insert + `:177` update in the `else` | **OK** — clearing path outside the finding block |
| `dispute-watch:119` insert + `:133` update, both inside the per-dispute loop | **OK-ish** — mirrors Stripe's own status per entity, but only while Stripe still enumerates the dispute; it is a mirror, not a sweep |
| `dispute-watch:156` insert (`early_fraud_warning`), no update anywhere | **OK** — question 1 dismisses it: an EFW is a point-in-time event, not a live condition |

If every row came back "needs a clearing path", the check is miscalibrated and will be
ignored. Both questions have to be allowed to say no.

### What the fix looks like

`refund-reconcile` (Fanta, commit `25266aa`, "a clean run now retires its own alarms") is
the reference shape — an `else` branch, outside the finding block, that runs on the clean
sweep:

```ts
if (falseClaims.length > 0 || stuckPending.length > 0) {
  /* ...insert dispute_alerts row, email... */
} else {
  await supabase.from("dispute_alerts")
    .update({ status: "cleared " + new Date().toISOString().slice(0, 10) })
    .eq("kind", "refund_mismatch")
    .not("status", "like", "cleared%");
}
```

Before it, signature `refund_recon:0:1` outlived its stuck refund by four days and read as
a live money problem. The same class kept 4 CRITICALs lit for hours on 2026-08-22 while
every sensor exited 0, and left a SentinelBox ticket open 10 hours after delivery was
restored — because nothing closes a ticket when the condition quietly clears.

Related memory: `alarm-with-no-recovery-path`, `deployed-credential-goes-stale`,
`negative-controls-catch-always-true`.


## Integration

Pair with:
- `/browser-qa` for pre-deploy verification
- Hooks: add as a PostToolUse hook on `git push` to auto-check after deploys
- CI: run in GitHub Actions after deploy step
