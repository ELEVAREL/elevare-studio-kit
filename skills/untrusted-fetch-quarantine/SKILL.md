---
name: untrusted-fetch-quarantine
description: >-
  Fetching or reading a third-party web page saved to disk — checking a
  prospect's or competitor's website during prospecting or outreach research,
  scraping a directory or listing page, saving a fetched page, curl or
  Invoke-WebRequest writing HTML to a file. Third-party HTML is untrusted input,
  so fetch it with scrape-guard.ps1 into D:\.scrape-cache, scan it, and never
  open it in a browser. Also covers what a Defender hit on a scraped page means
  (the SOURCE domain is compromised, not this machine) and how to triage when
  the scan cannot run. Localhost and own-property captures are out of scope.
origin: >-
  Elevare Studio — two Trojan:HTML/Redirector.JBA!MTB detections from prospecting
  scrapes (2026-08-14 and prior). Incident record in memory; this file is the
  procedure.
tools: Bash, PowerShell, Read, Grep
owners: security-reviewer, automation-engineer, design-researcher, cold-email-specialist, sales-closer, business-strategist, temptation-growth-marketer
---

# Untrusted fetch quarantine

**The download is not the risk. The pile is.** Inert HTML on disk is as harmless as a text
file — `curl` writing it and an agent grepping it are the same act. It executes only when a
browser *renders* it. The exposure is a growing heap of hostile-capable files sitting in a
shared, long-lived folder, one careless double-click from running in a browser profile that
holds live Stripe, Supabase, Vercel and Meta sessions.

This has produced two `Trojan:HTML/Redirector.JBA!MTB` detections on this machine, both from
prospecting scrapes. On 2026-08-14 Defender quarantined `%TEMP%\cz.html` while **more than
160 other untrusted third-party pages** sat beside it with two-letter scratch names, no scan
step and no expiry — 38 MB over four days. (The two memory notes disagree on the exact count,
164 vs 167; neither is reconstructable now, and the order of magnitude is the point.)

## 1. Does this apply? Test the HOST, not the file

| Fetch target | Quarantine? |
|---|---|
| `localhost`, `127.0.0.1`, a dev server, your own preview URL | **No.** Ordinary temp file. |
| A domain this studio owns or built (client site, own product) | **No.** |
| A prospect / competitor / directory / aggregator / search-results page | **Yes.** |
| Anything reached by following a redirect off one of the above | **Yes** — that is the whole attack. |

This scoping is measured, not theoretical. On 2026-09-06 `%TEMP%` held 18 loose `.html` files
written over the previous 24h with exactly the incident's naming habit (`p.html`, `t.html`,
`s.html`, `y.html`, `r.html`, `f.html`). Provenance by canonical URL: **9 were
`http://localhost` Whyza QA snapshots, 8 were own or client sites, 1 was empty. Zero were
third-party.** A rule that fired on all 18 would have been wrong 18 times and ignored by the
19th run. Fire on the host.

## 2. The one command

```powershell
D:\.claude\agents\tools\scrape-guard.ps1 -Fetch "https://example.com"
# prints the saved path on stdout; deterministic SHA name, never a server-chosen filename
```

| Exit | Meaning | What you do |
|---|---|---|
| 0 | fetched, scanned, clean | proceed — read it as TEXT |
| 1 | fetch failed | ordinary network error; do not retry with raw `curl` |
| 2 | **malicious** — Defender detected it | §4. The SOURCE is compromised. |
| 3 | **UNVERIFIED** — the scan could not run | §5. **This is a FAILURE, not a pass.** |

**Never substitute raw `curl -o` / `Invoke-WebRequest -OutFile` / a fetch tool writing into
`%TEMP%`.** The tool was never the problem; agents bypassing it were. `%TEMP%` is shared,
long-lived, and does not expire on its own.

`D:\.scrape-cache` is swept daily at 04:15 by the scheduled task **Elevare Scrape Cache
Expiry** (24h TTL, `-AlsoTemp`). Verified 2026-09-06: `State=Ready`, `LastTaskResult=0`, last
run 04:15:03 — "expired 22 file(s), 0.9 MB".

## 3. Never render it

Read it as text. `grep` it. Parse it. That is safe, and it is how the 2026-08-14 payload was
attributed — sibling captures were read as text, never opened. If a page genuinely must be
rendered, use headless Chrome in a throwaway profile, never the daily browser.

## 4. Exit 2 — a hit means the SOURCE is compromised

A detection on a scraped page does **not** mean this machine is infected. Real-time protection
catches these on write.

**Expect the payload host to be someone else's hacked small-business site.** On 2026-08-14
`bonnesantellc.com` — a lapsed prospect domain picked up by a redirect network — 301-chained
through five unrelated businesses onto a JURAGANTOGEL88 page served from
`togel02.amisialmedicalspa.com`, a **compromised med-spa domain**. That is why it survives a
glance: the hostname reads as an ordinary salon-sector business, not a bad neighbourhood.

Then:

1. **Do not assume the file is gone.** Measured 2026-09-06 with an EICAR positive control in
   `D:\.scrape-cache`: Defender fired twice (`ActionSuccess=True`, on write at 11:09:02 and
   again on the scan at 11:09:16) and `-ScanDir` correctly returned **exit 2** — but
   `Test-Path` on that file still returned **True** afterwards. The reliable signal is
   `Get-MpThreatDetection` with `ActionSuccess`, not `Test-Path`. Delete the path yourself.
   (`-Fetch` deletes on detection; the `-ScanDir` branch does not.)
2. **Append the whole redirect chain** — lapsed domain, every hop, payload host, CDN — to
   `D:\.claude\agents\tools\scrape-blocklist.txt`. Add to it, never rebuild it.
   **Nothing enforces that file.** Verified 2026-09-06: `scrape-guard.ps1` contains no read of
   `scrape-blocklist.txt` (grep returns one unrelated string in a warning message), and its
   only referrers are a README and a CSV. The file's own header claiming "Consumed by
   scrape-guard.ps1 -Fetch" is false. **You are the enforcement — check the list before you
   fetch.**
3. **Drop the prospect** to `salons-sect-excluded.csv` with the reason, and record that the
   **business is a victim, not a perpetrator**. Phone and walk-in contact stay legitimate;
   only the domain is poison.

## 5. Exit 3 — the scan did not run

Exit 3 is UNVERIFIED. The guard's first version reported "clean" when the scan could not run
at all — the classic always-green gate. Do not re-create it by treating 3 as 0.

**Diagnose with the CPU delta, not the status flags.**

```powershell
$s = Get-MpComputerStatus; "$($s.QuickScanInProgress) $($s.FullScanInProgress)"
$a = (Get-Process MsMpEng).CPU; Start-Sleep 20; "{0:N1}s" -f ((Get-Process MsMpEng).CPU - $a)
```

The in-progress flags are **not diagnostic** — measured blank in both of these:

| Observation | Flags | MsMpEng CPU / 20s | Verdict |
|---|---|---|---|
| 2026-08-14, guard returned 3 twice | blank | **0.0 s** | **stale Defender lock** — needs a service restart or reboot |
| 2026-09-06, mid-scan | blank | **119.1 s** | a real scan is running — wait it out |

When the scan genuinely cannot run, **do not claim clean.** Text-triage instead, and say
plainly that it is not a Defender pass:

```bash
grep -lEi 'eval\(atob\(|eval\(unescape\(|document\.write\(unescape' *.html
grep -lEi 'http-equiv=.{0,2}refresh' *.html
grep -lEi 'togel|judi|sbobet|slot[-_ ]?gacor|situs[-_ ]slot|casino[-_ ]online' *.html
```

**Two false positives that will fool you:**

- **Never grep bare `slot`.** Measured 2026-09-06 against the 18-file `%TEMP%` pile: the naive
  marker `togel|slot|casino|judi` flagged **7 of 18** files — *all seven false*, every hit the
  token `slot` from Radix/shadcn `data-slot` attributes (29 occurrences in one Next.js page).
  The anchored regex above returns **0 of 18** on the same corpus in the same run.
- **Google's minified JS uses `String.fromCharCode` heavily**, so a saved SERP trips an
  obfuscation heuristic and is not malware.

## 6. Traps measured on this machine

- **Never `-ScanDir %TEMP%`.** Verified 2026-09-06: it did not return in **10 minutes** and was
  killed. `%TEMP%` holds 2,506 top-level files (406 MB) plus 7,332 subdirectories. Scan the
  quarantine directory instead — `-ScanDir D:\.scrape-cache\<subdir>` returned in **3 seconds**
  on the same machine minutes later.
- `scrape-guard.ps1` and `scrape-cache-expire.ps1` are **ASCII-only on purpose.** PowerShell
  5.1 parse-errors on non-ASCII literals under a scheduled task, and the failure looks exactly
  like the task never ran. Do not paste smart quotes or em dashes into them.
- Drift check any time you suspect the habit has come back: `scrape-guard.ps1 -Audit` — loose
  HTML count in `%TEMP%`, cache size, Defender posture, open detections. Exit 0.
- **"Open detections" in `-Audit` is a history, not a live threat list.** `Get-MpThreatDetection`
  keeps a record after the threat is handled. Verified 2026-09-06: minutes after the EICAR
  control was detected (`ActionSuccess=True`) and its whole directory deleted, `-Audit` still
  listed `D:\.scrape-cache\_guard-selftest\positive-control.html` twice under "Open detections".
  Before you escalate on that section, check whether the path still exists and whether
  `ActionSuccess` is True — a listed path with the file gone is a resolved record.

## Verified on this machine

| Claim | What was run | Result | Date |
|---|---|---|---|
| `-Fetch` clean path | `-Fetch https://example.com` | exit 0, `fetch_100680ad546ce6a5.html` | 2026-09-06 |
| `-ScanDir` detects and fails closed | EICAR control in `D:\.scrape-cache\_guard-selftest` | exit 2, 2 detections, `ActionSuccess=True` | 2026-09-06 |
| a detection leaves the path behind | `Test-Path` after exit 2 | **True** | 2026-09-06 |
| small-dir scan is cheap | `-ScanDir <selftest dir>` | exit 0 in 3 s | 2026-09-06 |
| `%TEMP%` scan is unbounded | `-ScanDir $env:TEMP` | no return in 10 min | 2026-09-06 |
| flags blank during a real scan | `Get-MpComputerStatus` + CPU delta | blank / 119.1 s | 2026-09-06 |
| expiry task is live | `Get-ScheduledTaskInfo` | Ready, result 0, 22 files expired | 2026-09-06 |
| blocklist is unenforced | `grep -i blocklist scrape-guard.ps1` | no read of the file | 2026-09-06 |
| detections persist in `-Audit` | `-Audit` after deleting the EICAR dir | path still listed twice | 2026-09-06 |
| gambling-marker FP rate | naive vs anchored regex, same 18 files | 7/18 → 0/18 | 2026-09-06 |
| host-scoping is necessary | canonical-URL provenance of the pile | 0/18 third-party | 2026-09-06 |
| the stale-lock reading (0.0 s CPU) | — | **historical**, observed 2026-08-14; not reproduced today | 2026-08-14 |

Incident narrative lives in memory, not here: `scraped-html-is-untrusted-code`,
`untrusted-html-fetch-hygiene`, `negative-controls-catch-always-true`.
