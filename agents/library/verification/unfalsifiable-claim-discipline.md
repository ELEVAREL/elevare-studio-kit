# Unfalsifiable-claim discipline: the receipt, the confidence ladder, and a gate that enforces both

**Harvested 2026-09-13** from the `$49 website audit report` wave. Never deployed; the discipline
and the gate are the residue worth keeping.

## When to reach for it

You are about to hand a human a document that makes claims about a system they own: a site audit, a
security review, a performance report, a QA report, a monitor digest, a migration post-mortem, a
"here is what is wrong with your site" sales artifact. Also reach for it whenever a MODEL is writing
any part of that document.

Not for marketing copy in general. Reach for it when the document's entire value proposition is
that it is true, and when the reader is paying for the fact that they do not have to check it
themselves.

## 1. The receipt: every claim carries the control that proves it could have failed

Four fields, on every finding, never empty:

| field | content |
|---|---|
| `probe` | exactly what was run. The URL, the selector, the regex. |
| `observed` | exactly what came back. The literal string, or the literal absence. |
| `control` | the check that proves the probe was capable of failing. |
| `control_result` | what the control returned. |

Worked example from the real run:

- **probe:** the phone-number regex over the rendered text of every page, plus every
  `a[href^="tel:"]` and `a[href^="mailto:"]`, plus the served HTML of all eight sitemap routes, plus
  `llms.txt`, plus every `noscript` block.
- **observed:** zero telephone links, zero mail links, zero phone-shaped strings.
- **control:** the same regex run against the string `call us at (757) 555-0147 today`.
- **control_result:** matched `(757) 555-0147`. The detector works.

**Why the control field is the whole product.** "We found no phone number" is a claim anybody can
make, nobody can check, and a broken detector reports identically. "We found no phone number, and
here is the proof our detector was working when it found none" is a claim the reader can audit.

A finding with an empty receipt does not ship, enforced at the schema level, not by a reviewer.

This is the reader-facing face of [`control-first-check.md`](control-first-check.md). The gate keeps
the studio honest; the receipt lets the buyer verify it without trusting the studio.

## 2. The confidence ladder instead of a fabricated number

The natural next move after "rank findings by money, not severity" is to write "this is costing you
roughly $400 a month". That sentence is the most quotable line in the report, and the most likely to
be wrong. You do not have their traffic, their close rate, or their average job value. Any dollar
figure is invented, in the one document whose value is that it is not.

Worse: it is falsifiable in the buyer's favour. Say $400 to an owner who knows his phone rang twice
last month and you have told him the whole report is invented.

**Express the consequence as a MECHANISM and mark the confidence.** Three values, rendered visibly
differently:

| value | means |
|---|---|
| `measured` | the thing itself was observed on their system |
| `reasoned` | the mechanism is certain, the magnitude is not |
| `unknown` | flagged, and we say we do not know |

A report may contain zero `measured` money claims and still be excellent. It may not contain a
single fabricated one. Rank order is still by money: a missing phone number outranks a missing
autocomplete attribute without either being priced.

Carry a `killed` list too: claims the pipeline proposed and then DISPROVED, with the probe that
disproved them. Required, may be empty, always present. It is the cheapest possible proof that the
pipeline can say no.

## 3. Architecture, not prompt: probes discover, the model only ranks and explains

An instruction in a system prompt is a request, not a control. A model asked to DISCOVER findings is
a model that can invent them, and one fabricated finding in a paid report ends the product.

So: deterministic probes discover the facts and own the receipts. The model receives only what the
probes found and is allowed to rank, explain, and decide. This is the same "a system prompt is a
preference, not a control" argument as
[`../regulated-product-controls/two-layer-refusal-control.md`](../regulated-product-controls/two-layer-refusal-control.md),
applied to fabrication rather than to refusal.

## 4. The gate: [`_gates/overclaim.mjs`](_gates/overclaim.mjs)

A lexicon gate over model-authored prose only, calibrated in both directions.

Claim classes it catches, each with the reason the sentence cannot be checked recorded next to the
regex:

- comparative against an unmeasured corpus ("better than most sites we audit", "many businesses in
  this trade hide their prices", "unlike most", "industry-standard")
- security claim with no security scan behind it ("secure", "hardened", "locked down")
- totalising word over a set nobody fully enumerated ("fully", "comprehensive", "full set of
  security headers")
- unfalsifiable filler that maps to no probe ("correctly configured", "properly set up")
- absolute quantifier over people nobody counted ("every customer", "all callers")
- absolutes no sampling can support ("perfect", "flawless", "100%")

**Two things make it worth copying rather than rewriting.**

First, **scope**. It runs over model-authored fields ONLY. Receipts are authored by code and quote
real probes, so a receipt legitimately contains `strict-transport-security` and must never be
flagged for containing the letters `secur`. A gate wider than the real invariant fails on correct
content, and the repair it invites is to corrupt the evidence.

Second, **the clean fixtures are the more important half**. Committed `dirty` and `clean` lists;
calibration fails if any dirty string stays silent OR any clean string fires. The file's comments
record the narrowings that real false reds forced, and those comments are the only thing preventing
the next person from widening the rules back:

- bare `complete` was banned, which rejected the client's own documented promise of "a complete
  written estimate". Narrowed to `complete|full` only where it quantifies a SET.
- bare `most` stayed legal: "most customers in this trade will not fill out a form" is a reasoned
  claim about a vertical, which the confidence ladder above explicitly permits.
- "a customer will call a competitor" stayed clean; "a competitor who publishes no number" is
  banned, because nobody opened the competitor's site.
- `100%` cannot take a trailing `\b` (`%` is a non-word character), so `100% ready` silently never
  fired until a committed fixture caught it. Split out of the `\b`-delimited group, because the
  same trap applies to any token ending in punctuation.

Verified at harvest, 2026-09-13: `node overclaim.mjs` prints `CALIBRATION PASSED` and exits 0 across
14 dirty and 12 clean fixtures.

## Assumes / adapt

- Node 18+, zero dependencies, ES modules. Exports `findOverclaims(report)`,
  `modelAuthoredStrings(report)`, `runCalibration()`, `FIXTURES`.
- `modelAuthoredStrings()` walks a specific report shape (`report.headline`, `report.verdict`,
  `findings[].{title,money,evidence,fix}`, `decision.rebuild_would_change`). **Rewrite that one
  function for your document's shape and keep the RULES and the FIXTURES.** Adding a field to it
  without adding a fixture is how the gate silently stops covering the field.
- Two of the RULES are audit-product-specific in their `why` text (they name probe P13 and the
  absent `content-security-policy`). Rewrite those strings for your product; the regexes are
  generic.
- English only. It will not see a Spanish overclaim.

## Related

- [`control-first-check.md`](control-first-check.md), the parent shape.
- [`../regulated-product-controls/mutation-eval-suite.md`](../regulated-product-controls/mutation-eval-suite.md)
  for the same dirty-plus-clean calibration discipline applied adversarially. If your claim gate
  ever faces a motivated evader (it does not here: nobody is trying to smuggle an overclaim past
  you), add its normalisation and mutators.
- [`../deferred-billing-launch-offer/founder-tier-deferred-billing.md`](../deferred-billing-launch-offer/founder-tier-deferred-billing.md)
  for the claim-versus-reality parity rule applied to scarcity counters.
- [`../marketing/product-launch-kit-structure.md`](../marketing/product-launch-kit-structure.md)
  carries the built-versus-roadmap honest-framing rule, which is the marketing-side sibling.
