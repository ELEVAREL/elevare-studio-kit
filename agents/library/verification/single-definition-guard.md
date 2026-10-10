# Single-definition guard: a business rule written once, held there by a test that counts its copies

**Harvested 2026-10-01** from `D:\elevare-app` `tests/design/web-plan-rule.test.mjs` (commit
`3c8a72e`, wave 6 part 2, seam pass finding F1), with the record helpers in
`tests/harness/sources.mjs` and `tests/harness/control.mjs`. Verified at harvest on an export of
`6ff5617`: 4 of 4 pass and the run prints `1 definition(s) across 103 files in src/`; calibrated by
planting a real second copy as a new file under `src/` (exit 1, `2 definition(s) across 104
files`), removed, green again.

## When to reach for it

A predicate decides two or more things that must agree, and it has been (or will be) written
inline in more than one place. The source case: "is this person on a web plan" decided both that
the paywall shows its web face (which sells nothing) and that every "Top up" door sends the
person to the Store instead of the paywall. It was written three times (the paywall inline, the
Assistant's link helper, Home's door). Three copies of a rule drift, and the drift is invisible:
each screen is internally consistent and the product contradicts itself between them.

Typical candidates: entitlement and plan checks, "is this account active", "can this user see
X", feature-flag combinations, currency or rounding rules, a date window ("this week's reading").

## The recipe

1. **Move the rule to one named function** in one file (`onWebPlan(entitlement)` in
   `src/components/assistant/plan.ts`) and make every caller call it.
2. **Count the rule's DEFINING EXPRESSION across the whole source tree,** comment-stripped, and
   assert exactly one hit, in the named file. Write the regex for the expression's distinctive
   shape in BOTH orders of the operands:
   ```js
   const DEFINING = [
     /webPlanBlocksApple\b[^;\n]*\|\|[^;\n]*===\s*['"]square['"]/g,
     /===\s*['"]square['"][^;\n]*\|\|[^;\n]*webPlanBlocksApple\b/g,
   ];
   export function definitions(files) {          // files: [{ path, content }]
     const hits = [];
     for (const f of files) {
       stripComments(f.content).split('\n').forEach((line, i) => {
         for (const re of DEFINING) for (const m of line.matchAll(re)) hits.push(`${f.path}:${i + 1}  ${m[0].trim()}`);
       });
     }
     return hits;
   }
   ```
   Print the count and the file total in the run, not only the verdict, so "1 of 103 files" is
   visible and a walk that found 0 files cannot read as clean.
3. **Planted-duplicate CONTROL in the same file,** every run: append a fake record holding a
   second copy and assert the count assertion goes red (`expectRed`), and append the reversed
   spelling and assert it is counted. The planted copy is a record, not a file on disk, so the
   control leaves no residue and cannot be skipped.
4. **Assert the named callers reach the rule BY NAME** (`/const onWeb = onWebPlan\(entitlement\);/`
   in the paywall, the helper in each door). The count catches a copy; this catches a caller that
   quietly stopped calling it.
5. **Pin the rule's behaviour with a truth table** loaded from the real module, including the
   edge the copies disagreed on (here: an ENDED Square plan is not the web face; a Square plan in
   trial is).

## Design choices that make it trustworthy

- **Sweeps are pure functions over `{ path, content }` records,** never functions that read the
  disk themselves. That is what lets the control run in-process on every invocation; a sweep that
  reads the repo can only be calibrated by editing the repo.
- **`srcFiles()` throws on 0 files** ("a sweep over nothing reports clean"), and `file(files, path)`
  throws when a named path is missing, so a rename cannot turn an assertion into one that measures
  nothing.
- **The comment stripper preserves line numbers** (a block comment is replaced by its own
  newlines). The first version collapsed a 60-line header to one space and reported every later
  hit 40 lines off, pointing at a sentence in the header. It is deliberately conservative: it does
  not parse strings, it leaves `://` alone, and every caller asserts against a planted positive so
  an over-eager strip shows up as a missed plant.

## Limits, say them in the test header

- **A copy spelled differently passes:** a lookup table, a renamed field, the logic split across
  two lines. The count catches the copy-paste regression, which is the common one, and step 4
  catches the callers. It does not prove semantic uniqueness.
- The regex is specific to the expression. When the rule changes shape, update `DEFINING` in the
  same commit, or the count drops to 0 and the "exactly one" assertion goes red (correct, and loud).

## Related

[`mutation-control-harness.md`](mutation-control-harness.md) (`expectRed`, `mutateOnce`),
[`control-first-check.md`](control-first-check.md),
[`cross-layer-enum-contract-gate.md`](cross-layer-enum-contract-gate.md) (the same "one source of
truth" idea when the copies live in two languages),
[`../postgres-supabase/migration-history-contract.md`](../postgres-supabase/migration-history-contract.md)
(the same pure-function-over-records design).
