# The demo-data honesty gate: prove invented data is MARKED, in the served bytes

**Harvested 2026-09-18** from `D:\ThamesCoast` branch `feat/map-3d-districts`
(`506d764..f24d4c9`), file `scripts/verify/sample-marking.mjs`. Drop-in code, generalised:
[`_gates/demo-data-marking.mjs`](_gates/demo-data-marking.mjs).

## When to reach for it

**Every studio build that demos on mock, seed, sample or placeholder data.** A pitch build, a
pre-launch marketing site, a design prototype whose screenshots will travel, a product shipped
before its real data source is connected, any surface with a `MOCK_*` export in it.

STANDARDS.md already forbids this defect twice: *"a fallback to seed / demo / cached data must be
VISIBLE in the response"*, and *"never fabricate a breakdown"*. Both rules were written after a real
incident — Thames Coast's own database was deleted 2026-09-05 and **83 real visitors saw fabricated
events for nearly four days** while every external check said healthy. This file is what turns the
rule into something that fails a build instead of something a reviewer is supposed to remember.

**Nothing else in the studio does this.** It is the missing gate, not an improvement on one.

## The originating defect, which is the reason the shape matters

`src/lib/map-types.ts` carried this sentence for a day:

> "Every surface that renders a business MUST render its sample marking. A gate checks this by name."

**No gate checked it.** The `isSample` flag was written by the mock data and read by nothing —
12 references in `src/`, zero in `scripts/` and `tests/`. It is exactly the defect STANDARDS §Claim–
reality parity names: *a comment asserting a control IS a claim, and it is worse than a false UI
claim because every reviewer reads it and moves on.* The right fix was to **write the gate the
sentence was promising**, not to delete the sentence.

## The five rules the gate encodes

### 1. The marking lives in the DATA, not in a badge

`name: "Lantern & Lark (sample)"`, not `<Badge>sample</Badge>`. **A badge crops out of a
screenshot**, and screenshots of a demo build are the thing that travels furthest from your control.
A marking inside the string survives a crop, a copy-paste, an OG image and a slide deck.

The type makes the flag un-flippable: `isSample: true` (the literal, not `boolean`), so a record
that is not sample data cannot be constructed at all in this build.

### 2. Assert the SERVED BYTES, never the source

A source scan proves the marking was *authored*. It does not prove it *survived rendering*. Two ways
it does not, both invisible to a human and fatal to every machine reader:

- **Framework interpolation splits a sentence.** React serialises `Foo {bar} baz` with `<!-- -->`
  between the parts. A disclosure written as one sentence in JSX arrives in the bytes in three
  pieces. The gate asserts the disclosure survives **as one contiguous string** and ships a control
  for exactly this.
- **Styling a substring inserts an element boundary.** If the `(sample)` suffix is styled lighter,
  the bytes read `Lantern &amp; Lark <span class="sample-suffix">(sample)</span>` — so
  `html.includes("Lantern & Lark (sample)")` **fails on correct output**. Check the base name and
  the marking separately, and check the entity-escaped form of the name too (`&` → `&amp;`).

### 3. Every marking is derived from ITS OWN source flag

The companion component (`sample-name.tsx`) is the other half of this asset and generalises to any
mixed real/demo surface:

```tsx
/** Marking that sits next to a NAME. Comes from the data string, never a flag. */
export function SampleName({ name }: { name: string }) {
  const at = name.lastIndexOf(SUFFIX);
  if (at < 0) return <>{name}</>;          // no suffix: render untouched, never invent one
  return <>{name.slice(0, at)}<span className="sample-suffix">{name.slice(at)}</span></>;
}

/** Marking that sits next to a FIGURE. Reads a flag — and it must be THAT figure's flag. */
export function SampleMark({ when }: { when: boolean }) {
  if (!when) return null;
  return <span className="sample-suffix"> (sample)</span>;   // ONE contiguous literal
}
```

**Why this matters is flip-day.** These markings started as eight hardcoded spans against two flag
reads. The page was honest that day and would have been dishonest the moment a real source was
connected: the two gated sentences would switch to "Live auction" while seven figures kept printing
"(sample)" beside real money. **That is the same defect the flag exists to prevent, pointing the
other way.** So a figure off the auction state passes `auction.isMockData`; a figure off a business
record passes that record's `isSample`. One data source going real cannot silently un-mark another's.

Two mechanical rules that follow: **write the literal once and contiguously** (never
`{"("}sample{")"}`, never built by concatenation — the framework inserts separators), and **never
slice a name down to its base** anywhere in the render path.

### 4. Ban the vocabulary of measurement, not just the numbers

The gate greps the served HTML for phrases that present a fabricated figure as observed — `"Live
auction"`, `"visitors so far."`, `"Live figures"`. A demo counter may show the SHAPE of a live
counter; it may not use the word that claims someone counted. This is the served-bytes form of
STANDARDS' *"a humanized freshness string is a CLAIM ABOUT AN OBSERVATION."*

### 5. Refuse the adjacent hazard in your own domain

Thames Coast's second check is `checkNoStreetNumbers`: **no invented record carries a street
number**, because a number plus a real-sounding street is what makes a person drive somewhere that
does not exist. The check is domain-specific; **the obligation is not**. Ask what a visitor could
*act on*: a phone number they might call, an order id they might quote, a price they might budget
for, an availability slot they might plan around. Ban it in the fixture data and gate it.

## The two things that make it evidence rather than decoration

**It ships six known-bad fixtures and runs them first** — one per check, not one per script. If any
fails to fire it exits 2 **without reporting on the real data**. (Parent shape:
[`control-first-check.md`](control-first-check.md). Read
`%USERPROFILE%\.claude\skills\calibrated-check\SKILL.md` before trusting any check.)

**It states its own denominator.** `parsed 9 records against 9 declared` — if the text parse
silently matched nothing, every check would pass *vacuously* and print OK. Mismatch is exit 2.

One bug from the original worth keeping in the generalised copy as a comment: the first version
sliced each record to the first `},`, which cut short the three records containing a nested array of
object literals and reported them as unmarked. **A checker inventing a defect is the same class of
failure as one missing a defect.** The record ends at the *next* record's `id`.

## Assumes / adapt

- Node 18+ (`fetch` built in), zero dependencies, ES modules. Run it in CI and as part of the ship
  gate: `node demo-data-marking.mjs` for static checks, `node demo-data-marking.mjs http://host:port`
  for the served half.
- **Six values in one `CONFIG` block at the top are the whole adaptation surface**: `MARK`,
  `DATA_FILE`, `BLOCK_START`/`BLOCK_END`, `ROUTE`, `DISCLOSURE`, `BANNED_MEASURED_PHRASES`.
- It reads the demo data **as text with a regex**, because Node cannot import a `.ts` module and
  adding a transpiler is how a gate acquires a dependency that later breaks it. If your fixtures are
  `.json` or `.mjs`, import them and delete `parseRecords`.
- **No base URL = SKIP, never a pass.** The script says so on stdout. Do not let a CI job that
  forgot the URL argument read as green; either pass the URL or treat the run as half-done.
- The served-bytes half checks server-rendered HTML. For a client-rendered surface the markings are
  not in the initial bytes — drive it with a headless browser and feed `document.documentElement
  .outerHTML` into `checkServedHtml` instead of the fetch.
- **Delete this gate in the same change that connects the real data**, along with the `isSample:
  true` literal type and the marking components. A gate asserting everything is fake, running over
  real data, is the next version of this defect.

## Related

- [`control-first-check.md`](control-first-check.md) — the parent shape (run your control first,
  refuse to report when it does not fire).
- [`false-green-casebook.md`](false-green-casebook.md) — the worked incidents.
- [`unfalsifiable-claim-discipline.md`](unfalsifiable-claim-discipline.md) — the comment-as-claim
  rule this gate exists to satisfy.

Verified at harvest, 2026-09-18: the generalised copy was run standalone from
`library/verification/_gates/` and all six known-bad fixtures printed `FIRED`; with no project data
file present it then exits 2 with `CANNOT CHECK`, which is the correct behaviour and not a pass.
