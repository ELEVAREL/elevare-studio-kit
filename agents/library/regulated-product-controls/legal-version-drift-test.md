# Legal-document version drift test

Harvested from `D:\HausAI\src\lib\stripe\__tests__\legal-versions.test.ts`. ~60 lines. It caught
real drift **twice** before anything shipped.

---

## What it is

Your app stores a consent record — an ARL/auto-renewal capture, a ToS acceptance, a cookie
consent — stamped with `TERMS_VERSION`, `PRIVACY_VERSION`, and their effective dates, held as
constants in code. Your published documents are markdown with front matter:

```markdown
**Version:** 1.1
**Effective date:** 6 August 2026
**Previous version:** 1.0
```

"Bump the constant in the same change as the document" is a rule somebody has to remember — right
up until it is a test. This **parses the published document** and asserts against the constant.

```ts
function publishedVersion(file: string): string {
  const m = read(file).match(/^\*\*Version:\*\*\s*(\S+)/m);
  if (!m) throw new Error(`No "**Version:**" line in ${file}`);
  return m[1].trim();
}

it("TERMS_VERSION matches the version published in TERMS.md", () => {
  expect(TERMS_VERSION).toBe(publishedVersion("TERMS.md"));
});
```

Plus four assertions that are the actual value:

- **One effective date PER DOCUMENT.** A single shared `LEGAL_EFFECTIVE_DATE` describing two
  documents *must* misstate one of them the moment their dates diverge — inside a record whose whole
  job is provability. The test asserts the two are distinct and ordered, so re-collapsing them into
  one value cannot satisfy both per-document assertions.
- **No draft marker.** A consent record cannot cite a `-draft` version.
- **The predecessor is named by the document, not inferred from the number.** Shipping "1.1" implies
  a public "1.0" existed. Assert the document *says so*: `**Previous version:** 1.0`.
- **The date parser is strict and throws rather than passing.** No `new Date(string)` — that quietly
  accepts a reformatted line and hands back a timezone-shifted day. A `D Month YYYY` regex, an
  explicit month table, and an error message that says *"update the parser to match the document's
  format — do not weaken the assertion."* **A date this test can no longer read is a date it can no
  longer protect.**

## When to reach for it

- Any product capturing consent with a version stamp: subscriptions (auto-renewal law), ToS
  clickwrap, privacy/CCPA notice-at-collection, cookie consent, data-rights clauses.
- Any pair of "a constant in code" + "a published document" that must agree — pricing constants vs.
  a pricing page, a fair-use ceiling vs. the Terms, a retention window vs. the policy.

## What it costs

~60 lines and a front-matter convention on your legal markdown. No dependencies beyond `node:fs`.

## What it does NOT do

- **It does not check the document is CORRECT, published, or reachable.** It compares two strings.
  A version bump on a page nobody can load still passes. Pair it with a **deployed-URL fetch** — the
  origin run shipped 16 visible `[NEEDS…]` notes to a live privacy page while a stage-isolated test
  passed throughout, because the test exercised one function rather than the real publish pipeline.
  Assert on the **residue** of the deployed page (`does any <!-- or [NEEDS survive?`), not on one
  known shape of the defect.
- **It does not enforce deploy ORDER.** If a new version must be live before a migration or a
  feature lands (CCPA notice-at-collection: the first insert *is* a point of collection, and a
  purpose disclosed afterwards was not disclosed), that ordering is a runbook item this test cannot
  see.
- **It does not review the clauses.** Not a substitute for counsel.
- **It does not stop a version bump with no substantive change**, nor detect a substantive change
  with no version bump. It only stops the two *records* disagreeing.

## Assumes / adapt

- Legal documents live in the repo as markdown with a `**Version:**` / `**Effective date:**` /
  `**Previous version:**` front-matter block, read at test time from `process.cwd()`.
- The constants live in exactly **one** module. If two modules declare a version, this test protects
  one of them and the other drifts.
- When a version genuinely moves, the anchor case (`expect(TERMS_VERSION).toBe("1.0")`) is
  **updated deliberately, not deleted** — restate what the original assertion actually cared about
  (here: that "1.1" cites a predecessor that really existed) rather than dropping it.

## Related

- `serverless-thin-client/self-contained-legal-page-endpoint.md` — how to *serve* the policy page.
- `deferred-billing-launch-offer/founder-tier-deferred-billing.md` — consent capture in a dormant
  billing spine.
- STANDARDS.md — *"assert the end state, never a source something else may have superseded."*
