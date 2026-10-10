# Mutation controls that prove they mutated, and verify scripts that give the same verdict on a Windows checkout

**Harvested 2026-09-29** from `D:\elevare-app` (Expo app, `node:test` suite of ~970 tests, Windows
dev machine), merged to `main` at `ef19800`. Sources, all commit `640a59e` ("Let the verify scripts
and the test harness run on a Windows checkout"): `tests/harness/control.mjs`,
`scripts/verify/native-guard.mjs` (its `readLf` reader), and
`tests/contracts/verify-line-endings.test.mjs`. Verified green at harvest on the clean `ef19800`
checkout (part of the 147 of 147 run).

**Runnable, studio-generic, use as-is:** [`_gates/mutate-once.mjs`](_gates/mutate-once.mjs)
(`mutateOnce`, `expectRed`, `expectRedAsync`, plus `--selftest`: 11 of 11 pass at harvest, and a copy
with the CRLF branch removed exits 1 with 2 named FAILs, so the self-test can fail).

## When to reach for it

- You are writing a test that proves another test can go red by mutating the source under test (a
  "CONTROL" test, the house style of every calibrated suite in the studio).
- Any repo that is edited on Windows and has no `.gitattributes`: every hand-written multi-line
  marker, and every verify script that searches source for a multi-line needle, is at risk.
- Read [`control-first-check.md`](control-first-check.md) for the neighbouring shape (a GATE that
  runs its own known-positive before reporting). This entry is the TEST-SUITE version: the control is
  a mutation of real source, and the danger is a mutation that silently did not happen.

## Part 1: `mutateOnce`, a substitution that refuses to be a no-op

The failure: `source.replace(marker, broken)` where `marker` no longer matches substitutes nothing.
The "control" then runs the assertion against UNMODIFIED code, stays green, and is banked as a fired
control. The more disciplined the reader, the more confidently they trust it.

`mutateOnce(source, from, to, label)` throws, naming the label, when:

- `from` is absent (the marker drifted): `CONTROL CANNOT MUTATE`;
- `from` appears more than once (which behaviour broke is unknowable): `CONTROL IS AMBIGUOUS`;
- the result equals the input;
- `from` still appears in the result: `CONTROL DID NOT REMOVE THE TARGET`. (Consequence: to INSERT
  after a marker, include the following context in both `from` and `to`, e.g. replace
  `"  'user-error',\n]);"` with `"  'user-error',\n  'network-error',\n]);"`.)

`expectRed(fn)` / `expectRedAsync(fn)` return `{ red, message }` instead of passing on any throw.
Always assert the message names the right cause (`assert.match(r.message, /store_refused/)`): a
mutation that breaks the file in an unrelated way throws a `TypeError`, which `assert.throws` would
count as a pass. That is a red for the wrong reason.

Canonical control:

```js
it('CONTROL: an unknown code falling to store_refused again turns the fail-safe test red', async () => {
  const mutated = mutateOnce(lf(readSource(FILE)), "reason: 'store_uncertain' };", "reason: 'store_refused' };", 'default flipped');
  const r = await expectRedAsync(() => runTheRealCheckAgainst(mutated));
  assert.equal(r.red, true, 'the check stayed green with the old default');
  assert.match(r.message, /store_uncertain/);
});
```

**Run the control through the SAME function the real test calls** (`checkVersionMatchesWording(src)`,
`historyProblems(files)`, `listenerError(code, mutatedSource)`), never a re-implementation, or the
control proves the copy and not the check.

## Part 2: the CRLF trap, in the harness and in the gates

With no `.gitattributes` and `core.autocrlf=true` (the Windows default), git checks every text file
out as CRLF. Hand-written markers span line breaks as `\n`. Measured in the source repo: **47 "CONTROL
CANNOT MUTATE" throws on markers that were present**, and the native-module verify gate exited 2,
"CALIBRATION IMPOSSIBLE", on every Windows checkout while exiting 0 on LF. EAS builds on Linux, so
the shipped app was never affected; a Windows developer or a Windows CI runner simply could not
calibrate the gate, and the failure predated the wave that found it.

Two fixes, one per kind of consumer:

- **Harness:** `mutateOnce` tries the marker as written first; only when it is absent AND the source
  contains CRLF does it rewrite `from` and `to` to CRLF. A marker CUT from the source (already CRLF,
  or ending on a lone CR because a `/m` regex's `[^\n]*$` stops before the LF) matches as written and
  is never touched. An LF source takes exactly the path it always did.
- **Gates and tests that read source:** normalise on read, once, at the reader
  (`readFileSync(p, 'utf8').replace(/\r\n/g, '\n')`), and say so in a comment. Every hash computed over
  source (consent ledgers, migration md5s) must hash the LF form, or it differs per checkout.

Prefer adding a `.gitattributes` (`* text=auto eol=lf`) to NEW repos. For an existing repo, the fixes
above are cheaper than a renormalisation commit that touches every file, and they keep working when
someone clones with a different setting.

## Part 3: a contract test that PROVES the gates are line-ending independent

`tests/contracts/verify-line-endings.test.mjs`, generalizable to any `scripts/verify/` folder:

1. **An enumeration with a denominator.** Every script in the folder is listed with `crlf: [inputs]`
   (tracked files whose endings the verdict can depend on) or `crlf: []` plus a `why`. The first test
   asserts the on-disk list equals the enumeration, so a NEW script fails until someone classifies it,
   and asserts at least one script is exercised, so the file is never green over nothing.
2. **Run each affected script's own calibration twice in a scratch root**: once with its inputs
   rewritten LF, once CRLF. The scratch root holds a copy of the script, the rewritten inputs, and a
   junction to the real `node_modules` (NODE_PATH was tried first and the LF control went red).
3. **Controls on the inputs:** the LF copy has zero CR; the CRLF copy has zero bare LF and
   `crlf === lines - 1`. Without these, "same verdict" could be two runs over the same bytes.
4. **Positive control:** the LF run must exit 0, so "identical verdicts" can never mean both broke.
   Then require identical exit codes AND identical stdout (with the scratch path scrubbed).
5. **Cleanup that cannot eat the real tree:** remove the junction on its own and check it is gone
   BEFORE the recursive delete of the scratch root; if it will not go, leave the scratch root behind
   rather than risk walking into the real `node_modules`.
6. A second block drives the real harness: a real multi-line marker against a CRLF copy of a real
   file must mutate, yield exactly the LF mutation in CRLF, and compile to the same module.

## Assumes / adapt

- Node 18+ (`node:test`), ES modules. `mutate-once.mjs` has no dependencies.
- The contract test needs each gate to expose a self-calibration command (`--selftest`); build gates
  that way from the start ([`control-first-check.md`](control-first-check.md)).
- Windows junctions (`symlinkSync(target, link, 'junction')`) need no admin rights; on POSIX use a
  plain symlink.
- Used by [`disclosure-to-code-pinning.md`](disclosure-to-code-pinning.md),
  [`../expo-ios-app/iap-fail-safe-error-mapping.md`](../expo-ios-app/iap-fail-safe-error-mapping.md)
  and the other entries harvested from the same wave.
