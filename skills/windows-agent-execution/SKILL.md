---
name: windows-agent-execution
description: You are about to write or run something on this Windows box — a .ps1 a Scheduled Task will execute, a Windows path inside a python -c / printf / heredoc / sed, a PowerShell variable name, a spawn() of an npm-installed CLI, a repo-wide rg sweep, or a scripted rewrite of a tracked file. Read this FIRST. These traps share one signature: the tool ACCEPTS the input, REPORTS success, exits 0, and does something else. The em-dash that parses clean under pwsh 7 and kills the scheduled task under 5.1; the \a in D:\.claude\agents that becomes byte 0x07; $pid quietly staying the process id so every API call 404s; spawn('bun') ENOENT inside a git hook that reads as an auth failure; a sweep whose rg never ran reporting CLEAN on 1,900 real hits. Use before writing a script, before scheduling it, before trusting a sweep, and whenever a Windows failure "looks like" auth, network, permissions, or a vendor outage.
origin: Elevare Studio — forged from seven dated incidents on this one machine (2026-07-03 to 2026-09-05); every trap below re-run and confirmed 2026-09-06
owners: automation-engineer, devops-engineer, backend-engineer, qa-verifier, delivery-lead, retrospective, agent-architect, skill-forge, performance-engineer, graphic-asset-designer, motion-ad-director, video-producer
---

# Windows agent execution — the traps that accept your input and do something else

Every agent in this studio runs on **one Windows 11 box**, through Git Bash, `pwsh 7`,
`powershell.exe 5.1` and Node — four runtimes with four different opinions about your
bytes. The traps here are not "Windows is annoying". They are a specific failure class:

> **The tool accepts the input, prints success, exits 0, and does something else.**

That is the same shape as a false green, so it survives review. Every incident
below was first misdiagnosed as auth, network, permissions, or a vendor outage.

This skill is **OS and harness traps only**. For a check that passed and might not have
been looking at anything, see `[[calibrated-check]]` — do not re-derive its procedure here.

---

## 1. A `.ps1` a Scheduled Task runs must be pure ASCII, and `pwsh 7` will not tell you

**Signature:** Scheduled Task **Last Result 1 and NO log file written**. The script died at
parse, before its first line, so nothing it would have logged exists.

**Mechanism:** `powershell.exe` 5.1 reads a `-File` script as the system **ANSI codepage**,
not UTF-8, unless the file carries a UTF-8 BOM. An em-dash written by a UTF-8 editor
becomes mojibake at parse time. In a **string literal or code**, that mojibake throws
`The string is missing the terminator: "` and the whole script fails. In a **comment** it is
harmless. `pwsh 7` reads UTF-8 correctly and parses the identical file **CLEAN**.

**Verified 2026-09-06** on a 3-line fixture with `—` (`e2 80 94`) inside a double-quoted string:

| host | `[Parser]::ParseFile` | `-File` run |
|---|---|---|
| `pwsh 7` | `CLEAN` | prints both lines |
| `powershell.exe` 5.1 | `The string is missing the terminator: "` | **exit 1, no output at all** |

**The rule:** keep every `.ps1` pure ASCII — no em/en dashes, no box-drawing, no smart
quotes. And **verify under 5.1 specifically**, never under the pwsh 7 you are typing in:

```
powershell -NoProfile -Command "$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('<abs path>',[ref]$null,[ref]$e);if($e){$e[0].Message}else{'CLEAN'}"
```

Scrub with `($t = Get-Content $f -Raw) -replace '[^\x00-\x7F]','-'` then
`Set-Content $f -Value $t -Encoding ASCII`.

**Run against the real launchers, 2026-09-06:** all **34** studio `.ps1` under `D:\.claude`
(including `automations\support-routine\run.ps1` and `automations\site-factory\run.ps1`, the
two that died on 2026-07-07) parse **CLEAN under 5.1**. Six files carry non-ASCII on **9
lines, all in comments** — currently harmless, and the parse is what says so.

**Calibration note earned by running it:** a line-level non-ASCII grep is a *pre-filter*, not
the check. Mine flagged `routines\emit-event.ps1:14` as `CODE_OR_STRING` because the em-dash
sits in a **trailing** `#` comment after real code. **The 5.1 parse is the authoritative
answer; the grep only tells you where to look.**

---

## 2. `\a \b \f \v` in a Windows path — and it is not the heredoc's fault

**Signature:** a path in a written file renders as `D:\.claudeBELgents`, `D:FFantahair`,
`D:\FantaAfricanHair<BEL>pple<BEL>pple-oauth-creds.txt`. The control byte does not print, so
the file *looks* right.

**Mechanism — corrected 2026-09-06.** The memory blamed Bash heredocs. It is not the heredoc.
`cat <<'EOF'` delivers `D:\.claude\agents` byte-for-byte correctly (verified with `od -c`).
The corruption is the **consumer language interpreting its own escapes**, and
`\a` `\b` `\f` `\v` `\t` `\n` are all *valid* escapes in every one of them:

```
python <<'PY' → "D:\.claude\agents" → 'D:\\.claude\x07gents'
python -c     → identical corruption, no heredoc involved at all
printf 'D:\.claude\agents\n' | od -c → ... e \a g e n t s
```

Python emits `SyntaxWarning: invalid escape sequence '\.'` — pointing at the **harmless**
`\.`, while silently accepting the `\a` that ate your path. The warning is a tell, not a
detector.

**Why the repairs failed too (reproduced today on the real mangled path):**

```
d.replace(b'\x07', b'\a')          → changed: False   ← b'\a' IS 0x07 in Python
d.replace(bytes([7]), bytes([92]) + b'a')  → changed: True, BEL gone
```

**The rules:**
1. Content containing Windows paths or regex escapes → use the **Write / Edit tools**. Every
   file I wrote with Write today is clean, LF-only, zero control bytes.
2. If a script must handle them: forward slashes, or raw strings, or build bytes from
   ordinals. Never write the replacement as a backslash escape.
3. `sed -i` and `re.sub` are hit identically **in the replacement side**.

**Detector (read-only, run it on any doc a script has ever touched):**

```
python -c "import os,re,sys;p=re.compile(rb'[\x07\x08\x0b\x0c]');[print('HIT',os.path.join(d,f)) for d,_,fs in os.walk(sys.argv[1]) for f in fs if f.endswith('.md') and p.search(open(os.path.join(d,f),'rb').read())]" "D:\.claude\agents"
```

**Run 2026-09-06:** 256 `.md` files under `D:\.claude\agents`, **1 still dirty** —
`HANDOFF.md` carries two `0x07` bytes, eight days after the trap was documented, in the file
every session reads at boot.

---

## 3. PowerShell already owns your variable name, and the script still exits 0

**Signature:** an API call to `/projects/40088` returning **"Project not found"** — which
reads as a permissions or scope problem. Or a wrapper script that runs with no arguments.

**Verified 2026-09-06, identically on `pwsh 7` and `powershell.exe 5.1`:**

| you wrote | what happened |
|---|---|
| `param([string[]]$Args)`, called with `-Args aa,bb` | **`count=0`, empty.** Silently dropped. A control param on the same line received its value fine. |
| `$pid = 'prj_ABC123'` | throws *"Cannot overwrite variable PID because it is read-only or constant"*, `$pid` **stays the process id**, `https://api.vercel.com/v9/projects/40088` |

**The part that makes it lethal:** with stderr not read, the script printed
`SCRIPT REACHED THE END` and **exited 0**. A caller checking stdout and the exit code sees
complete success while every URL carried a process id.

**The rule:** before naming a PowerShell variable, ask whether it is automatic. The ones that
bite: `$pid` `$Args` `$Host` `$Error` `$input` `$PSItem` `$Matches` `$Profile` `$Home` `$PWD`
`$OFS` `$Sender` `$Event`. Prefix yours: `$projId`, `$scriptArgs`, `$hostName`. The read-only
ones throw where you can see it; the read-write ones (`$Args`, `$Host`) just make your value
vanish, which is the dangerous half.

---

## 4. `spawn()` cannot reach an npm-installed CLI, and inside a git hook it looks like auth

**Signature:** `git push` prints a **Node stack trace** and `failed to push some refs`.

**Verified 2026-09-06** (`bun --version` works fine in the shell; `bun`, `bun.cmd`, `bun.ps1`
all present in `AppData\Roaming\npm`):

| `spawnSync(name, ['--version'])` | result |
|---|---|
| `'bun'` | **ENOENT** — the file on PATH is a 283-byte shebang script; `CreateProcess` cannot run it |
| `'bun.cmd'` | **EINVAL** — Node ≥ 18 refuses to spawn `.cmd`/`.bat` without a shell |
| `'bun.exe'` | ENOENT — does not exist |
| `'bun'` with `{ shell: true }` | **status 0, `"1.3.14"`** |

So `shell: true` is not one option among several — it is the only route. Node warns
`DEP0190` when you pass an args array with it; safe for static literals, **never** with
interpolated input.

**The rule:** a `git push` that fails with a Node stack trace is a **hook** failure, not a git
failure. Read `.git/hooks/pre-push` before touching credentials. Fix the hook; `--no-verify`
is the one move that keeps the gate broken. On 2026-08-23 this hid the fact that
`D:\clients\fantahair`'s typecheck+build gate had **never once run on this machine** — three
wrong theories (auth, divergence, then the hook) before it was found.
**Confirmed fixed:** `D:\clients\fantahair\scripts\ci-check.mjs:21` now passes `shell: true`.

---

## 5. `rg` is a shell function here, so half the ways of calling it report a false CLEAN

**Mechanism:** `rg` is a Bash **function** wrapping `claude.exe` with `ARGV0=rg`. Anything
that resolves a real binary cannot see it.

**Verified 2026-09-06** against a string that provably exists (`agent-decomposition` in
`D:\.claude\agents\SKILLS-MAP.md`, line 53 — positive control via the Grep tool: 1 hit):

| form | output | exit |
|---|---|---|
| `find ... -exec rg <pat> {} \;` | `find: 'rg': No such file or directory` | **0** ← reports CLEAN |
| `timeout 5 rg <pat> <file>` | `failed to run command 'rg'` | 127 |
| `echo <file> \| xargs rg <pat>` | `xargs: rg: No such file or directory` | 127 |
| Grep tool | 1 hit | — |
| `ARGV0=rg ~/.local/bin/claude.exe -n --no-ignore <pat> <path>` | line 53 | 0 |

The memory recorded "exits 0"; today only the **`find -exec`** form does. `timeout` and
`xargs` now exit 127. **The `find -exec` false-CLEAN is the live one** — and it fails toward
"nothing found", which is exactly the answer an audit wants to hear. On 2026-08-21 four
consecutive passes reported `D:\` clean of `elevarestudio.co`; the real answer was ~1,900
files including 7 CSP configs and a live ACME zone default.

**The rule:** for any sweep whose answer will be reported, use the **Grep tool** (it never
goes through the shell) or the explicit `ARGV0=` form — and calibrate against a known hit
first, per `[[calibrated-check]]`.

---

## Carried from incident records, not re-verified today

Each is dated and reproduced at the time; none was re-run in this session, and the reason is
stated. Treat as true-by-record, not as a fresh observation.

- **stdin piped into a CLI can be accepted and discarded.** `printf 'value' | vercel env add NAME production`
  printed **"Added Environment Variable"** and stored an **empty string**; `--value` does not
  exist on that CLI version and hangs on a TTY. Set env via the REST API and verify with
  `vercel env pull`, checking **length, not presence**. *(2026-09-05. Not re-run: it is an
  external write to a live project.)*
- **Every console subprocess in shipped Windows code must hide its window** or it flashes and
  reads as malware. `CREATE_NO_WINDOW` **alone still flashes** — always add `STARTUPINFO` +
  `STARTF_USESHOWWINDOW` + `SW_HIDE`. Never combine `DETACHED_PROCESS` with
  `CREATE_NO_WINDOW`; `DETACHED_PROCESS` also **suppresses a GUI window** the child tries to
  show. *(SentinelBox 1.4.3 / 1.4.11 / 1.4.12 / 1.4.14, 2026-07-03. Not re-run: the symptom is
  visual and unobservable headless.)*
- **Compound `Copy-Item` one-liners mangle destination paths.** Stage with **one `robocopy`
  per directory** and verify with `cmd /c dir /s /b DST`. When files seem to vanish, suspect
  **your own last shell command** before any external cause. *(2026-07-15, ~15 min lost to a
  phantom "something is deleting files" hunt.)*
- **A scripted whole-file rewrite flips line endings to CRLF.** When a script writes a file
  whose consumer is POSIX (`.sh`, a shebang script, a systemd unit, a Dockerfile), write LF
  explicitly and confirm with `git diff --stat` that only the intended lines moved. Prefer a
  targeted edit over regeneration. *(Two recurrences; STANDARDS.md carries the rule. Partially
  checked today: files written with the Write tool were LF-only, 0 CRLF.)*
- **A dev server and a build must never share `.next`.** `next build` while `next dev` owns
  the directory fails on Windows with `PageNotFoundError`/ENOENT on every route. Use
  `NEXT_DIST_DIR=.next-build`. **That failure is an environment collision, never a code
  defect** — do not "fix" the code for it. *(STANDARDS.md; `D:\whyza` carries `.next-mergegate`
  and friends for exactly this.)*

---

## Preflight — run before the thing runs, not after it fails

- [ ] Writing a `.ps1` a Scheduled Task will run → **ASCII only**, then `ParseFile` under
      `powershell.exe` 5.1, not pwsh 7
- [ ] Naming a PowerShell variable → not `$pid`/`$Args`/`$Host`/`$Error`/`$input`; prefix it
- [ ] Any file content containing `D:\...` → **Write/Edit tool**, never `python -c`,
      `printf`, or a heredoc body a language will re-escape
- [ ] `spawn()`ing an npm-installed CLI → `shell: true`, and check it is not sitting inside a
      git hook whose failure will read as auth
- [ ] Any sweep you will report → **Grep tool** or `ARGV0=` form, calibrated on a known hit
- [ ] Writing a file a POSIX runtime consumes → explicit LF, then `git diff --stat`
- [ ] Building alongside a running dev server → separate dist dir

## The diagnostic rule that ties them together

**When a Windows failure looks like auth, network, permissions, or a vendor outage, suspect
your own harness first.** Every incident behind this skill presented as somebody else's
problem: a push that looked like credentials, a 404 that looked like scope, a Scheduled Task
that looked dead, a repo that looked clean, an API that looked down. In all seven the caller
was the cause — and in all seven something reported success on the way past.

See also `[[calibrated-check]]` (a check that cannot fail is not evidence) and
`[[credential-drift]]` (a key that tests fine in one store and is stale in another).
