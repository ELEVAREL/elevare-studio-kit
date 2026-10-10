---
name: calibrated-check
description: You are about to trust a check that passed (a typecheck, a grep, a selftest, a served-bytes assertion, a wait loop, a browser probe) and report "verified" or "green" or "zero occurrences" to the owner. Run this FIRST. A check that cannot fail is not evidence, and the ways a check silently stops checking are specific, common, and invisible: bare `npx tsc` resolving to nothing, `grep -P` erroring and matching zero, a wait loop whose needle is a substring of the thing it is waiting to disappear, a probe sampled once on a value that has not settled, an exit code swallowed by a pipe, a comment-stripper that eats the real hits. Use whenever a result is about to become a claim, before saying anything passed, and especially when a check passes FIRST TIME on code you have not seen work.
origin: Elevare Studio, forged from a single night in which six separate checks lied (2026-09)
owners: qa-verifier, test-engineer, code-quality-engineer, retrospective, eval-master, database-architect, security-reviewer, design-auditor, social-post-critic, marketing-analyst
---

# Calibrated check: prove it can fail before you trust that it passed

## The rule

**Never report a check as passing until you have watched that same check fail.**

Break the thing on purpose, watch the check go red, put it back, watch it go green.
Two observations, not one. A pass you have not calibrated is a rumour.

This costs about thirty seconds. Skipping it has cost this studio entire sessions,
because a false green does not look like a failure. It looks like progress.

## Why this is not paranoia

Every one of these passed cleanly while checking nothing. All are real, all from
production work, all would have been reported as "verified":

| The check | How it silently stopped checking |
|---|---|
| `npx tsc --noEmit` | Resolves to nothing in a worktree with no local TypeScript. Exit 0. Zero files checked. |
| `node node_modules/typescript/bin/tsc` | Correct binary, but the worktree had **no `node_modules` at all**. Exit 1 with `MODULE_NOT_FOUND`, which a pipe then swallowed into a green. |
| `tsc --noEmit` in a fresh worktree | `tsconfig.json` was a `"files": []` solution stub. Compiled zero of the real source. |
| `grep -P '\x{2014}'` | Errored with *"character value too large"*, matched nothing, and reported **0 dashes on every page** including pages never fetched. |
| `grep $'\U2014'` | Silently matched nothing. Bash `$'...'` takes `\u` with FOUR hex digits and `\U` with EIGHT, so `\U2014` is a TRUNCATED 8-digit escape: it expands to something that is not an em dash and greps clean on a file full of them. Lowercase `$'—'` is correct and does work. One capital letter is the whole difference between a real count and a false zero. **Python does the same thing** and will not even compile `\U2014` in a normal string, which is the tell: if your language rejects the literal, your shell probably mangled it. Verified bash 5.3.9, 2026-09-05. |
| `git grep -F -l "/api"` in the Bash tool on Windows | **0 files, exit 1: byte-identical to a genuinely clean tree.** MSYS path conversion rewrites any argument beginning with `/` into a Windows path BEFORE it reaches a NATIVE binary, so `git.exe`, `rg.exe` and `node.exe` all receive the needle as `C:/Program Files/Git/api`. Truth: `MSYS_NO_PATHCONV=1 git grep -F -l "/api"` returns **255 files** where the bare form returned 0. Positive control: search the same needle with the leading slash removed (`git grep -F -l "api"` returns 367). Slashed zero plus bare nonzero means you are reading the rewrite, not a clean tree. **ripgrep is NOT a safe cross-check here:** `rg -F -l "/api"` also returns 0, so a second opinion from it HARDENS the false green. MSYS-built tools do not get the rewrite (`grep -rl -F "/api" src/` returns 153), which is why git looks like the culprit. Not confined to searching or to needles: `node -e "require('/tmp/x.json')"` threw MODULE_NOT_FOUND on a file that exists. Caught only because one lane cross-checked a single zero against two other searchers; a zero from a single search is the cheapest false green available. Measured in `D:\elevare-studio`, git 2.54.0.windows.1, 2026-09-14. |
| A wait loop on `"Hair is included in the price"` | The needle was a **substring of the old hedge** it was waiting to replace. Matched instantly, reported a stale page as deployed. |
| `grep supabase.co` over a web export, to prove the backend env was baked in | The Supabase **client library itself** contains that string, so an export with NO env (Metro had served a cached transform) passed. Every gate then rendered the "cannot reach Elevare" wall. A presence needle must be the configured VALUE (the project ref), and the same search must return 0 on a build known to lack it. elevare-app, 2026-09-29. |
| A one-shot overflow probe | Read `scrollWidth` before layout settled. Same page measured 375 and 490 on different runs. Either was publishable; one was wrong. |
| A hand-rolled comment stripper | Mis-parsed `don't` in JSX and `//` inside a URL, hiding real hits behind "clean". |
| `npm run build` | Printed `✓ Compiled successfully`, then died `spawn UNKNOWN` on Windows. Green-looking log, non-zero exit, nothing built. |
| A browser click from an extension's isolated world | Could not see page expandos, never reached React's delegated listener. Reported a **live production page** as dead. |

Note the pattern: **most of these fail toward green.** A broken check almost never
reports a scary error. It reports success, because "found nothing" and "did not
look" produce the same output.

## The procedure

1. **Run the check. Note the result.** If it is red, you are done: fix and re-run.
2. **Inject the exact defect the check exists to catch.** Not a nearby defect. If it
   guards against an em dash in visible copy, put an em dash in visible copy, not in
   a comment.
3. **Run again. It MUST go red, and name the right file and line.** A red that points
   somewhere else is a different check than you think you have.
4. **Remove the injection. Run again. It MUST go green.**
5. **Confirm the tree is clean** (`git status --porcelain`). Calibration residue left
   behind is worse than no calibration.
6. **Report both observations**, not just the pass: *"green, and calibrated red on an
   injected X at file:line."*

`scripts/calibrate.mjs` runs steps 1 to 5 for a shell check plus a file injection.

## Negative controls, the other half

Calibration proves the check fails on a bad input. A **negative control** proves the
check is looking at the real thing.

- Fetching a page? Fetch a URL you know does not exist and confirm it 404s. If your
  "200" and your known-bad both return 200, you are reading a shell, not a page.
- Asserting on served bytes? Splice the defect into the fetched bytes and confirm the
  assertion goes red on real fetched content, not just on a fixture.
- Testing a permission boundary? Try the thing that must be refused and watch it be
  refused. A test that only ever sees success proves nothing about denial.
- Measuring a token or credential? Test a known-dead one too.

## Specific rules earned the hard way

- **Never `npx tsc`.** Use `node node_modules/typescript/bin/tsc --noEmit`, confirm the
  `tsconfig` it picks actually `include`s the source, and calibrate it once per worktree.
- **Never let a pipe eat an exit code.** `cmd | tail` reports tail's status. Capture to
  a file, echo `$?` on its own, then read the file.
- **A wait loop's needle must be absent in the OLD state and present in the NEW one.**
  Prefer waiting for the old string to DISAPPEAR. Verify the needle is not a substring
  of what it replaces.
- **Sample anything layout- or timing-dependent until it converges.** Three consecutive
  equal readings, then report, and say that it converged.
- **A build that prints success and exits non-zero did not build.** On Windows,
  `spawn UNKNOWN` and `EINVAL ... new Worker` after `Compiled successfully` are known
  flakes: re-run, do not reinterpret.
- **When counting occurrences, strip `<script>` blocks** before counting visible copy,
  or an RSC payload double-counts every string.
- **Clear `.next` before a typecheck** after routes are added or deleted, or stale
  generated route types produce phantom errors about files that no longer exist.

## When someone else reports a green

Reports from subagents and other sessions are claims, not evidence. Ask: did they
calibrate? A report that says *"tsc clean"* is weaker than one that says *"tsc clean,
and calibrated red on an injected TS2322 at line 145, restored"*. The second is a
result. The first is a hope.

If a green arrives with no calibration and it matters, re-run it yourself.

## The failure mode this really guards

You will be tempted to skip this when the check passes **first time on code you have
not seen work**. That is exactly when it is most likely lying, because a genuinely new
implementation passing instantly is rarer than a check that is not looking.

See also [[hydration-assertion]] for the specific case of a page that renders but never
mounts, and [[credential-drift]] for the specific case of a key that tests fine in one
store and is stale in another.
