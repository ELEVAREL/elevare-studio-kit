# Autonomous daily site "groom" — headless `claude -p` self-improve → gate → auto-deploy → email report (Windows Scheduled Task)

**When to reach for it:** you host a LIVE site you built and want it to **improve itself a little every day, unattended** — a scheduled headless Claude Code pass that audits the live site + code, fixes the safe findings, runs the test/build gate, and (only if green) commits + pushes to auto-deploy, then emails the owner a found/fixed/shipped/flagged report. The "keep a launched site getting better on its own" routine. Distinct from the ticket-driven [`autonomous-support/autonomous-support-ticket-system.md`](../autonomous-support/autonomous-support-ticket-system.md) (which reacts to owner-filed tickets across a fleet): this is a **single-site, proactive, whole-site self-improve loop** with no ticket queue. Complements the one-shot [`external-approval-golive-watcher.md`](external-approval-golive-watcher.md) (which waits on an external approval).

**Assumes / adapt:**
- Windows + a per-user install of Claude Code (`claude.exe`), driven by a Windows Scheduled Task. The launcher trio is Windows-specific; the *prompt* + *guardrails* + *deploy path* are portable to a cron + `claude -p` on macOS/Linux.
- The site auto-deploys on push to its production branch (GitHub→Vercel git integration — see §4). If your deploy is manual, replace step 6 with your deploy command and keep everything else.
- Resend (or any HTTP email API) for the report, sending from a verified domain.
- Secrets in a gitignored `.env.local`, never printed/logged/committed.
- **This is an autonomous agent acting on a live site — the HARD GUARDRAILS in §3 are load-bearing, not decoration.** Keep the "never touch billing / never publish / never destructive / never deploy a red build" rails verbatim; they are what make an unattended daily push safe.

---

## 1. The launcher trio (hidden, no-flash, ASCII-safe)

Three files. The `.vbs` exists solely to run the `.ps1` with **no console flash** ([[scheduled-task-no-flash-pattern]], [[windows-subprocess-no-window-rule]]); the Scheduled Task calls `wscript ops\<name>.vbs`.

**`ops\morning-groom.vbs`** — hidden launcher (window style `0`, don't wait `False`):
```vbscript
' Hidden launcher (no console flash). Runs the PowerShell runner hidden (0), returns immediately (False).
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NonInteractive -NoProfile -ExecutionPolicy Bypass -File ""D:\<Project>\ops\morning-groom.ps1""", 0, False
```

**`ops\morning-groom.ps1`** — the runner. **Pure ASCII** — WinPS 5.1 reads `.ps1` as ANSI, so one smart-quote or em-dash breaks the whole scheduled script ([[ascii-only-ps1-scheduled-tasks]]):
```powershell
# Daily groom runner (headless Claude Code self-improve pass). ASCII-only (WinPS 5.1 = ANSI).
$ErrorActionPreference = 'Continue'
$root   = 'D:\<Project>'
$claude = 'C:\Users\<User>\.local\bin\claude.exe'
$logDir = Join-Path $root 'ops\groom-logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$stamp = Get-Date -Format 'yyyy-MM-dd'
$log   = Join-Path $logDir ('groom-' + $stamp + '.log')

Set-Location $root
$prompt = Get-Content (Join-Path $root 'ops\groom-prompt.txt') -Raw

("[{0}] Groom start" -f (Get-Date -Format 'u')) | Out-File -FilePath $log -Append -Encoding ascii
& $claude -p $prompt --dangerously-skip-permissions *>> $log
("[{0}] Groom end (exit {1})" -f (Get-Date -Format 'u'), $LASTEXITCODE) | Out-File -FilePath $log -Append -Encoding ascii
```

**`ops\groom-prompt.txt`** — the instruction set (§2 + §3). Kept as a file (not inline in the `.ps1`) so it's editable without touching the launcher and so the prompt can hold newlines/structure freely.

**Scheduled Task:** `<Project> Morning Groom`, daily at your chosen time, action = `wscript.exe "D:\<Project>\ops\morning-groom.vbs"`. On laptops, **disable "Start the task only if the computer is on AC power"** (DisallowStartIfOnBatteries) or it silently never runs on battery. Runs in the installing user's context so DPAPI/`.local\bin` resolve.

---

## 2. The groom prompt — ordered, end-to-end, no questions

The prompt makes Claude act as the delivery-lead conductor and work the studio flow autonomously. The ORDER is the safety:

```
You are the <Project> Morning Groom, acting as delivery-lead conductor of the studio agents.
Autonomous daily self-improvement pass on the LIVE site. Work end to end without asking questions.

FACTS
- Live site: <url> (Vercel). Repo: D:\<Project> (remote origin = <org>/<repo>; push <branch> auto-deploys).
- Commit author for any commit: <deploy-identity email> (GitHub <handle>). Never commit as anyone else.
- Secrets live in D:\<Project>\.env.local. Never print, log, or commit them.

DO THIS, IN ORDER
1) Restore point: git tag groom-<YYYY-MM-DD> + a bundle at D:\_sec-backups\<project>\groom-<YYYY-MM-DD>.bundle BEFORE any change.
2) Audit: review the live site + code for real errors, regressions, a11y/contrast, SEO gaps, perf, broken links,
   clear UX/design wins. Use the quality agents (design-auditor, code-quality-engineer, security-reviewer,
   performance-engineer, seo-specialist, qa-verifier, art-director) as needed. Prioritize genuine issues over churn.
3) Report: write a groom report to D:\<Project>\docs\grooms\<YYYY-MM-DD>.md with FOUND / FIXED / SHIPPED / FLAGGED.
4) Fix only SAFE, clearly-beneficial findings. Keep diffs small and reviewable.
5) GATE (mandatory): run "npm test" and "npm run build". If EITHER fails, do NOT deploy; revert working changes and report the failure.
6) If gate green AND files changed: git add + commit (correct author) + git push origin <branch> (auto-deploys). If nothing changed, skip commit/push.
7) ALWAYS send the email report, even on a clean no-change day.

EMAIL  (Resend HTTP API, RESEND_API_KEY from .env.local; From: a verified domain; To: <owner>;
        Subject: "<Project> Morning Groom <YYYY-MM-DD>"; Body: FOUND/FIXED/SHIPPED (incl. commit SHA + short
        diff summary if deployed)/FLAGGED. Clean no-change day = "Clean bill of health, no changes shipped."
        Human, skimmable. No AI tells, no em-dashes.)

Finish by confirming the email was sent.
```

**Why the order matters:** restore point *before* any edit (revertable no matter what); audit → report → fix → **gate → deploy** (never the reverse); the email *always* sends so a silent failure is visible.

---

## 3. HARD GUARDRAILS (paste verbatim into the prompt — never override)

These are what make a daily unattended push to a live site safe. They encode the studio's standing rules for autonomous action:

```
HARD GUARDRAILS (never override)
- Never touch billing. <BILLING flag> stays owner-only; never add/enable it, never create/activate Stripe charges, prices, or coupons.
- Never enable <AUTOPOST flag> and never publish social posts.
- Never send cold email or any email other than this one groom report.
- Never make destructive or irreversible changes (no data deletion, no dropping tables, no force-push, no history rewrite).
- NEVER deploy a red build. If tests or build fail, ship nothing.
- Anything risky or ambiguous: FLAG it in the email and leave it for the owner. Do not do it.
```

Guardrail rationale, so they're adapted not just copied:
- **Billing / publish / cold-email off** — these are the human-sign-off actions from the PLAYBOOK. An autonomous loop must never cross them; it drafts/flags, the owner acts. (Matches [[no-discounts-without-client-signoff]], the payments-human-only rail.)
- **No destructive/irreversible ops** — the loop can only move forward safely (edit + revert), never delete/force-push/rewrite. The daily tag+bundle is the backstop.
- **Red build = ship nothing** — the test+build gate is the single deploy interlock. A green local build is the *minimum*; keep the gate in the prompt AND rely on the deploy platform's own build.
- **Flag, don't gamble** — ambiguity routes to the owner via the email, never to an autonomous change.

Using the Max/subscription plan for this internal self-heal loop is fine (internal ops, single-site) — but a public/multi-user app must not run on the personal sub ([[no-subscription-for-multiuser-app]]).

---

## 4. Deploy path — GitHub → Vercel push-to-deploy (the reliable one for site-factory projects)

**Reach for git-push-to-deploy, not CLI upload, for any hosted site the studio grooms/iterates.** It's the reliable path: the routine only has to `git push`, and the platform builds + deploys + gives you preview URLs, atomic rollbacks, and a build gate for free. A `vercel deploy` CLI upload from a scheduled task is fragile (auth token drift, uploads local uncommitted state, no PR/preview trail).

Setup (once):
1. `git init` the project; first commit is step 0 of the build (STANDARDS — no repo, no ship).
2. Create the remote (private is fine) under the deploy org and push the production branch.
3. In Vercel, **import the repo via the Git integration** and set the project's production branch. Now push = deploy.
4. **Commit author MUST be a real GitHub account** or Vercel blocks the deploy ([[deploy-identity]]): `git config user.email "<deploy-identity>"`. A project vanity email that isn't a GitHub account will block prod.
5. If the Git connection ever resets, re-check the project's **Root Directory** (e.g. `web`) and production branch.

**This is a deliberate exception** to the studio's usual "backups repo, NO auto-deploy" stance ([[github-backups]]): a groomed site's repo IS the deploy source, so push = production. Be explicit about that per project so a routine push doesn't surprise-deploy a repo that was only meant to be a backup.

Cron gotcha if the site runs its own scheduled jobs: **Vercel crons run in UTC.** A fixed-UTC cron drifts one hour across daylight saving relative to a local-time audience — compute the cron string from the audience zone and note the DST caveat.

---

## 5. Definition of done / operability
- Trio installed, Scheduled Task `State=Ready`, first run confirmed in `ops\groom-logs\`.
- A dry run produced a `docs\grooms\<date>.md` report and sent the email (even on a no-change day).
- The gate provably blocks: a deliberately-red build in a test run must NOT deploy and MUST email the failure.
- Restore points landing daily (tag + `D:\_sec-backups\<project>\*.bundle`).
- Guardrails present verbatim in `groom-prompt.txt`; billing/publish/cold-email flags named for THIS project.
- Register the install in project memory (task name, schedule, prompt path, log path, email from/to) so it's operable by a non-author.
