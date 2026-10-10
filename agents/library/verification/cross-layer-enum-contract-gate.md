# An enum consumed in TWO layers must be GATED, not remembered

A generic recipe for the defect class *"a value was added in one layer and not the other, and nothing
in any build can see it."* The canonical instance: a notification kind added in TypeScript with no
matching arm in the Postgres dispatcher whose `CASE` ends `else false` — an inbox row that never
pushes, behind a settings toggle over nothing.

## When to reach for it
Any **closed set of values consumed in more than one layer** where the layers cannot type-check each
other:
- notification / event / job kinds: rendered in app code, dispatched by a SQL `CASE` or a queue
  worker.
- status, role, reason, plan, or channel enums: a DB `check` constraint + a TS union + a UI label map.
- feature-flag keys, error-code tokens, webhook event names, analytics event names.
- permission strings: a policy list in SQL and an `if` chain in code.

**The tell:** adding a value requires you to *remember* to edit a second file, and forgetting produces
no error — just a feature that silently does nothing.

**The mirror failure is equally silent and worth gating in the same file:** the SQL side referencing a
column or value that does not exist. In plpgsql that does not fail at deploy — it raises the first
time a cron runs, inside a job nobody watches.

## The recipe (five parts, all five required)

### 1. Parse both layers from source — do not hand-maintain a third list
A third list is a third thing to forget. Read the real files.

```ts
const FILES = migrationFiles().map((f) => ({ file: f, sql: readFileSync(join(MIGRATIONS, f), "utf8") }));
const TS_KINDS = tsKindsFrom(readFileSync(MESSAGES, "utf8"));
```

For SQL you need a comment stripper that **preserves offsets and line numbers** (so a thrown error
can name a real line), leaves string-literal contents alone (a `--` inside a string is data), and
keeps going inside dollar-quoted bodies by tracking the tag stack (comments inside a function body
are still comments). For TypeScript, strip block and line comments before matching `case "..."`, or a
commented-out branch reads as live.

### 2. Compute the EFFECTIVE definition by REPLAY, never "the last one wins"
The obvious implementation — "take the last `create or replace function f` by filename order" — is
wrong the moment any migration mutates a function **in place** (see
[`../postgres-supabase/anchored-function-patch.md`](../postgres-supabase/anchored-function-patch.md),
which is exactly what a parallel wave should be doing). A last-definition reader stops at the last
full body and never learns about the branches patched in after it, then reports a confident wrong
answer.

Get it the way Postgres does: **start at the last full definition and replay every later mutation in
filename order.**

```ts
export function replayFunction(name: string, files: Array<{file: string; sql: string}>): Replay {
  let body: string | null = null;
  const trail: string[] = [];
  for (const { file, sql } of files) {
    const code = stripSqlComments(sql);
    if (!code.includes(name)) continue;
    const accounted: Array<[number, number]> = [];
    // (a) full definitions -> replace `body`, record the span
    // (b) anchored patch calls -> apply the substitution to `body`, record the span
    // (c) FAIL CLOSED: any other mention of `name` outside those spans THROWS
  }
  if (body === null) throw new Error(`No migration defines ${name}.`);
  return { body, trail };
}
```

Match the patch call by **shape**, not by a hardcoded helper name, so a later migration using the same
form is replayed too:

```ts
const PATCH_CALL = /\(\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*\)/g;
```

Mirror the SQL helper's own guarantees rather than trusting them: a patch anchor that occurs zero or
two times in the effective body **throws**, naming the file, line, and anchor.

### 3. Fail closed on every shape you do not understand
This is the difference between a gate and a decoration. Sweep every remaining mention of the watched
symbol and throw unless it is one of the shapes you handled:

```ts
// grants/revokes change who may execute it, never what it does -> ignore
if (/^\s*(grant|revoke)\b/i.test(line)) continue;
// a call from inside another object's body is a consumer, not a mutation -> ignore
if (new RegExp(`(public\\.)?${name}\\s*\\(`).test(line) && !/\bfunction\b/i.test(line)) continue;
throw new Error(
  `${file}:${lineOf(code, o.index)} mentions ${name} in a shape this gate cannot replay:\n  ${line.trim()}\n` +
  `Extend replayFunction() — do not delete this check. An unreplayable mutation must be RED, never silently ignored.`,
);
```

A future migration that mutates the function in a shape the parser has never seen makes the test
**red**. It never makes it quietly wrong. *A regex that stops matching and reports "all consistent"
is the false green this studio has shipped before.*

### 4. Every parser THROWS on a degenerate input — and each throw has its own test
A parser that matches nothing makes every downstream assertion **vacuously true**. So:

```ts
if (arms.length === 0) throw new Error(
  "push_queue's per-kind CASE parsed to ZERO arms. That is a parser failure, not a consistent " +
  "world: a body with no arms pushes nothing at all.");

if (!/else\s+false/i.test(body)) throw new Error(
  "The CASE no longer ends in `else false`. The whole premise of this gate is that an unlisted " +
  "kind falls to a silent false; if that changed, re-derive the gate before trusting it.");

if (!/^(pr\.[a-z_]+|true|false)$/i.test(rhs)) throw new Error(
  `arm for ${kinds} decides on \`${rhs}\`, which this gate cannot evaluate. Extend the parser ` +
  `rather than letting an unknown right-hand side read as "covered".`);
```

…and then a whole `describe("the parsers cannot silently match nothing")` block that feeds each
parser the degenerate input and asserts it throws. **Write these before you trust the real
assertions.** The last one is the important pattern: assert your gate's own *premise* still holds
(the `else false`), because a gate whose premise quietly changed is worse than no gate.

Add a matching **"the inputs are real"** block so a green is about the codebase and not an empty set:

```ts
it("read a plausible catalog from TypeScript, including the kinds this wave shipped", () => {
  expect(TS_KINDS.length).toBeGreaterThanOrEqual(30);
  for (const sentinel of ["repost_new", "follow_new", "post_hidden"]) expect(TS_KINDS).toContain(sentinel);
});
it("replayed through every migration that touches them", () => {
  expect(QUEUE.trail.length).toBeGreaterThanOrEqual(2);   // not just the first definition found
});
```

### 5. Ratchet the known debt as a LIST, never as a count
The reverse direction (a value the SQL side dispatches that the app has no branch for) is usually
non-empty on the day you write the gate, and it usually belongs to other lanes. Do not assert it
green and do not assert `length <= 3`:

```ts
const KNOWN_UNRENDERED = ["account_terminated", "held_media", "post_held"];
it("has not grown past the three kinds recorded on 2026-09-06", () => {
  expect([...PUSHABLE].filter((k) => !TS_KINDS.includes(k)).sort()).toEqual(KNOWN_UNRENDERED);
});
```

A pinned list means a **fourth** value cannot join silently, and it makes the file itself the debt
register. That is debt with a name and a ceiling, not coverage. Report the live defects in the
handoff too — a ratcheted list is a record, not a fix.

## Calibrate it before you trust it
STANDARDS: *a green proves nothing until you have watched it go red.* Apply each mutation, observe the
**named** test fail, restore, and verify the restore byte-for-byte (`cmp`). Write the calibration log
into the file's header comment so the next reader does not have to re-derive it. The five that
matter:

1. Add a fake value to the app-side switch → the drift test names it.
2. **Delete the real arm the wave added** → the drift test names it. *This reproduces the actual
   defect the gate exists for* — the single most valuable calibration in the set.
3. Point the arm at a misspelled column → the mirror test names the column.
4. Feed a parser the degenerate input → it throws rather than reporting an empty, consistent world.
5. Remove a later in-place patch → the ratchet goes red, proving the **replay** (not a hardcoded
   file) is what supplies those values.

## Assumes / adapt
- Vitest + Node `fs`, run from the repo root. Any runner works; nothing here needs a database — it is
  a **static** gate over source files, so it runs in CI with no credentials and no live system.
- Therefore it proves the *files agree*, not that the live system matches the files. Pair it with a
  live check (`md5(prosrc)`, `information_schema`) at the ship gate.
- The regexes here are calibrated to one SQL dialect and one code style. **Re-derive them for your
  tree, then re-run the vacuity controls** — a borrowed regex that silently matches nothing is
  precisely the failure this file exists to prevent.
- Cost: roughly 550 lines for one enum pair, most of it parser + controls. Justified when the enum is
  consumed by a delivery mechanism (push, email, webhook, billing) where a missing arm is invisible.
  Not justified for a display-only label map, where the missing case is visible on screen.

## See also
- The `calibrated-check` skill — the general form of "a check that cannot fail is not evidence."
- [`false-green-casebook.md`](false-green-casebook.md) — the incidents behind STANDARDS §Verify.
- [`../postgres-supabase/anchored-function-patch.md`](../postgres-supabase/anchored-function-patch.md)
  — the write-side twin; this gate exists partly because that pattern makes "the last definition" a
  lie.

*Harvested from the Whyza reposts wave, `tests/unit/reposts-contract.test.ts` (2026-09-06). Verified
green at harvest: 23 tests passing via `npx vitest run tests/unit/reposts-contract.test.ts`. The
recipe here is sections 1–4 of that file plus the ratchet pattern; the project-specific assertions in
its section 5 were deliberately not lifted.*
