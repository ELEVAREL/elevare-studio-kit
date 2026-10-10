# The control-first check: a gate that refuses to report when its own control does not fire

**Harvested 2026-09-13** from the `$49 website audit report` wave (deterministic probe pipeline,
metered model pipeline, rendered document, four gate scripts). Nothing in that wave was deployed;
the code below is the only thing that outlived it. Three independent lanes in that wave arrived at
this same shape without coordinating, which is the reason it is filed as a shape and not as four
scripts.

## When to reach for it

You are about to WRITE a check that a human will later trust: a lint, a grep sweep, a contrast
audit, a copy ban, a design rejection list, a security probe, a build gate, a QA assertion. Reach
for this before you write it, not after it goes green.

Read `calibrated-check` (`%USERPROFILE%\.claude\skills\calibrated-check\SKILL.md`) when you are
about to TRUST a check somebody else wrote. This entry is the other direction: how to construct one
so that trusting it is warranted. Read [`false-green-casebook.md`](false-green-casebook.md) for the
worked incidents that motivate both.

## The shape, in five parts

### 1. The check runs itself against a known-positive BEFORE it runs against the real target

Not a unit test in a separate file that may not have been run. Inline, on every single invocation,
printed to the same stdout as the result. The cost is microseconds and the payoff is that the zero
underneath it is evidence rather than silence.

```js
const CONTROLS = [
  { pattern: "U+2014 EM DASH (literal)", text: "this is a test \u2014 with an em dash" },
  // ... one per pattern the detector claims to carry
];
let allFired = true;
for (const c of CONTROLS) {
  const fired = scan(c.text).some((h) => h.pattern === c.pattern);
  if (!fired) allFired = false;
  console.log(`  ${fired ? "FIRED       " : "DID NOT FIRE"}  ${c.pattern}`);
}
if (!allFired) {
  console.log("\n  CONTROL FAILED. This detector cannot be trusted. Refusing to report.");
  process.exit(2);
}
```

**One control per rule, not one control per script.** `rejection-list-checks.mjs` carries twelve
rules and twelve synthetic positives. A script-level smoke test proves one rule works and says
nothing about the other eleven, each of which is separately capable of returning a clean-looking
zero forever.

### 2. It also runs a known-NEGATIVE, and a false positive is equally fatal

A detector wide enough to fire on correct content gets switched off by the first person it
inconveniences, or worse, invites a "fix" that damages the real artifact. `overclaim.mjs` carries a
`clean` fixture list alongside its `dirty` list and fails calibration if any clean string fires.
Its inline comments record two narrowings forced by real false reds; keep that habit, because the
comment is the only thing stopping the next person from widening the rule back.

### 3. "I could not compute it" gets its own exit code and never looks like a pass

The single most common way a gate stops gating is that its input moved and it now checks nothing.

| exit | meaning |
|---|---|
| 0 | ran, and everything passed |
| 1 | ran, and something failed |
| 2 | did not run: the control did not fire, or the input could not be resolved |

`contrast.mjs` exits 2 with `CANNOT CHECK` when the token block it parses is absent, rather than
reporting zero failures over zero pairs. `build.mjs` in the same wave used exit 3 for "rendered,
but findings were dropped", so a downstream gate could not read a silent drop as a clean build. Pick
the codes deliberately and write them in the file header.

### 4. Exclusions are NAMED and PRINTED on every run, never applied silently

Every real detector accumulates exclusions. A silent exclusion is how a detector stops detecting.

- `emdash-check.mjs` splits into TIER 1 (blocking, no exclusions possible) and TIER 2 (review, with
  four named exclusions printed on every run and every surviving hit shown in context for a human).
- `rejection-list-checks.mjs` cuts the one declared token block out before its hex and clamp rules
  run, then prints how many lines it cut, so the cut cannot quietly grow to swallow the document.
  It also marks those two rules `control n/a (rule reads a pre-cut region)` rather than faking a
  control for them, which is an honest gap rather than a decorative green.
- Self-exempt files are a listed `Set`, never inferred from a path pattern.

### 5. The comment-stripper trap, in both directions

This bit the wave twice, in opposite directions, in two different files:

- **A stripper that eats real hits.** `rejection-list-checks.mjs` strips CSS comments before its hex
  and clamp rules, because a sentence about `clamp()` is not a `clamp()`. It prints the byte count
  removed, and it applies the stripper to those two rules ONLY. The emoji and serif rules still read
  the whole file, comments included.
- **An extractor that reads garbage FROM a comment.** The audited site's own `<head>` contained an
  HTML comment holding the literal text `<title>`. A naive title regex matched inside the comment
  and returned garbage. The crawler strips comments before extraction and keeps them separately.

The rule that covers both: **state what your stripper removed, in the same output as your result,
and scope it to the rules that need it.**

## Two more rules the same wave paid for

- **More than one candidate input is a REFUSAL, not a guess.** `build.mjs` originally took "any
  `report*.json`, newest first". `readdirSync` is alphabetical, not chronological, so "newest" was a
  comment and not a behaviour, and it silently selected the oldest of three candidates. Which
  variant a buyer receives is not a decision a renderer gets to make by sort order. Resolve the
  exact contracted name; if it is absent and exactly one candidate exists, use it and SAY WHY; if
  two exist, refuse.
- **Quoting evidence verbatim can import the violation you are gating on.** The audited site's own
  meta description contained em dashes, so quoting it inside a receipt would have tripped the gate.
  Normalise quoted evidence on the way IN and say in the artifact's metadata that you did. Silently
  altering a quote inside a receipt is the exact failure the receipt exists to prevent.

## Assumes / adapt

- Node 18+, zero dependencies, ES modules. All four scripts run standalone with `node <file>`.
- The scripts in [`_gates/`](_gates/) are working reference implementations, not drop-ins. Their
  rule TABLES are specific to the audit-report surface (`--sb-*` tokens, a receipt disclosure, a
  handyman vertical). **Copy the harness, rewrite the table.** The harness is the asset.
- `emdash-check.mjs` is the exception: it is studio-generic as-is and enforces a studio-wide ban.
  See its own entry below.

## The three scripts, and what each is for

| file | what it is |
|---|---|
| [`_gates/emdash-check.mjs`](_gates/emdash-check.mjs) | **Studio-generic, use as-is.** Two-tier em-dash and en-dash detector over any path or tree. TIER 1 (blocking): literal U+2014, U+2013, and every HTML entity spelling of both. TIER 2 (review): the `--` digraph used as a dash, with four named printed exclusions and every surviving hit in context. Runs nine controls plus a known-clean string first and exits 2 if any fails. Exists because `grep -P` errors on this machine and its error reads as a clean pass. `node emdash-check.mjs <path> [<path> ...]`; TIER 1 must be 0. |
| [`_gates/rejection-list-checks.mjs`](_gates/rejection-list-checks.mjs) | A design rejection list run as a DETECTOR rather than asserted in a summary: no score or grade, no gauge or meter, no severity chips, no three-KPI card band, no serif, no hard-coded hex outside the one declared token block, no dark mode, no emoji, no carousel, no count-up, plus a motion budget and an accent budget counted from the stylesheet. Twelve synthetic positives; any rule whose control does not fire reports MISCALIBRATED and exits 2. **Rewrite the rule table per surface; keep the harness, the pre-cut reporting, and the accent-budget counting note (an anchored regex silently undercounted the budget by missing a mid-line declaration).** |
| [`_gates/overclaim.mjs`](_gates/overclaim.mjs) | Filed here as code; the discipline it enforces is written up in [`unfalsifiable-claim-discipline.md`](unfalsifiable-claim-discipline.md). |

Verified at harvest, 2026-09-13: `node emdash-check.mjs` control passes 9 of 9 with 0 false
positives; `node overclaim.mjs` prints CALIBRATION PASSED and exits 0; `node rejection-list-checks.mjs`
against the wave's built document fired all twelve controls and exited 0; `contrast.mjs` calibration
printed `AS EXPECTED` on all four rows and exited 0.

## Related

- [`false-green-casebook.md`](false-green-casebook.md) for the incidents.
- [`cross-layer-enum-contract-gate.md`](cross-layer-enum-contract-gate.md) for the same fail-closed
  discipline applied to a closed set consumed in two layers that cannot type-check each other.
- [`../ui-craft/token-resolved-contrast-gate.md`](../ui-craft/token-resolved-contrast-gate.md) for
  the contrast instance of this shape.
- [`../metered-quota/pg-cron-concurrency-proof.md`](../metered-quota/pg-cron-concurrency-proof.md)
  carries the same principle stated for a race harness: a harness that cannot produce the failure it
  exists to detect has not calibrated itself.
