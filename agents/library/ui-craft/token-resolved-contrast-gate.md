# Token-resolved contrast gate: measure the ratio out of the built stylesheet, not off a table

**Harvested 2026-09-13** from the `$49 website audit report` wave. Never deployed. Drop-in code:
[`_lib/contrast.mjs`](_lib/contrast.mjs).

## When to reach for it

Any surface where a contrast claim is going to be made: a design-auditor pass, a CRAFT or STANDARDS
gate, an accessibility statement, a client-facing "AA on every text pair" line, a token-set change
that touches colour. Reach for it especially when the tokens use `var()` chains or `color-mix()`,
because the hand-typed-table approach cannot see either.

## Why this instead of a checklist or a browser extension

Three failure modes, all of which this file closes:

1. **A number quoted from a comment is not a measured number.** The wave's own stylesheet carried
   `globals.css:334  1.18:1` next to a border token. Measured, that pair is 1.18:1 against `--card`
   and **1.29:1 against `--background`**, the page ground. Both are decoration and the conclusion
   was unchanged, but the comment was being repeated as though it were a measurement of a different
   pair.
2. **A hand-typed colour table does not move when a token moves.** This script reads the
   `[data-surface="daylight"]` custom-property block out of the SHIPPED file and resolves the
   `var()` chains itself, so editing a token in the stylesheet moves the script's output. That is
   the only arrangement under which the number means anything.
3. **`color-mix()` is wrong in the dangerous direction when mis-parsed.** `color-mix()` serialises
   to `color(srgb 0.43 0.16 0.85)` in the 0-to-1 domain, NOT `rgb(110 40 217)` in the 0-to-255
   domain. A parser that assumes 255 clamps every mixed colour to near-black, which makes ratios on
   a light ground look BETTER than they are. Silent, and it fails towards "pass".

## The four calibration rows

Printed before the real table on every invocation. If the known-fail row does not say FAIL, the
script is not a check and exits 2.

| row | what it catches |
|---|---|
| KNOWN-FAIL: a decorative hairline token treated as text at floor 4.5 | the gate cannot go red at all |
| KNOWN-PASS: body foreground on background | the gate is red on everything (an over-tight parser) |
| KNOWN-VALUE: `color-mix(in srgb, var(--background) 100%, var(--foreground))` on background, which must be exactly 1.00:1 | the srgb 0-to-1 domain mis-parse above. A 255-domain parser reports roughly 19:1 here |
| IDENTITY: any colour on itself, 1.00:1 | arithmetic or compositing drift |

Calibration rows report against their OWN expectation, not against the floor, so a row that is
supposed to be 1.00:1 does not read as a defect.

## ★ The four-STAGE structure (added 2026-09-18 from the Thames Coast 3D map wave)

The four calibration rows above are stage 1 of four. A second, independent implementation
(`D:\ThamesCoast\scripts\verify\contrast.mjs`, 936 lines, `506d764..f24d4c9`) arrived at the same
parser and then went further. **Copy the structure, not its palette.** Stages 0–3 all run before any
real data is touched, and any failure among them exits **2** — the script does not report on the
real data at all.

| stage | what it is | what it catches |
|---|---|---|
| **0 · parser controls** | assertions about the colour reader itself, incl. the `color-mix` → `color(srgb 0-1)` trap above, and *"the parser returns `null` for `var(--radius-xl)` rather than reading `20px` as black"* | a parser that silently answers for non-colours |
| **1 · calibration against PUBLISHED values** | reproduce, to 2dp, **every ratio your direction doc / design system already publishes** — 16 rows in that build | the script and the document having quietly diverged |
| **2 · independent controls, regexed out of a DIFFERENT file** | two water-vs-land separations pulled back out of `globals.css` with a regex, not typed into the script | a doc edit silently moving the control |
| **3 · must-fail controls** | deliberately wrong assertions: `#000` on `#FFF` claimed as 20.00, a floor comparator that must go red, a ceiling comparator that must breach, a translucent-glass pair that must fail | the comparator having stopped comparing |

Three of these are genuinely new and worth lifting verbatim:

**★ Stage 1 must include a known FAILURE.** That build's calibration set carries
`#F26B4B on #FFFFFF = 3.01` — a published, accepted, AA-large-only value. **A checker that is not
really checking cannot reproduce a 3.01**; it can only reproduce passes. A calibration set of
sixteen passing rows proves far less than fifteen passes and one known failure.

**★ Stage 2's controls are read back out of the source of truth, not transcribed.** The two
incumbent figures are located by regex in the stylesheet that publishes them:

```js
const m = /light\s+water vs land\s+[\d.]+\s*->\s*([\d.]+)/.exec(globalsCss);
if (!m) { line("  [FAIL] could not locate the published figures."); 
          line("         UNVERIFIED: this control did not run. Not inventing the numbers."); }
```

Note the failure branch: **"could not locate" is reported as UNVERIFIED and fails the stage.** A
control that silently skips is a control that does not exist.

**★ State the denominator of every text parse.** That build parses its canvas palette out of a
`.ts` file as text (a WebGL style is JSON and cannot read `var()`, so the canvas palette *must* be
TypeScript). It then counts the keys the `MapPalette` interface declares and **fails if it recovered
fewer**. Without that, a regex that matched nothing makes every downstream check pass vacuously.

## ★ Three additional things to measure that a token-pair gate misses

**Delivered pixels are quantised; your compositor is not.** Compositing in float and compositing to
0–255 give different ratios. White at alpha 0.72 over black is **183.6 in float and 184 delivered** —
which is the whole of a 7.32-vs-7.35 disagreement between a gate and a header comment. Neither
number is wrong; they answer different questions. Report both where they differ, and be explicit
about which one a claim is quoting.

**A translucent panel's alpha is a computed bound, not a taste decision** — and it can come out
theme-asymmetric. See [`translucent-panel-alpha-bound.md`](translucent-panel-alpha-bound.md); this
gate is what computes it.

**Gate the MIRROR whenever one value must exist in two languages.** A WebGL/canvas style is JSON and
cannot read `var(--x)`, so the same colour is authored once in TypeScript and once in CSS with no
mechanism to share it. Assert they are equal, in the gate, or they will drift:

```js
const mapLandLight = /:root\s*\{[^}]*--map-land:\s*([^;]+);/.exec(stripComments(globalsCss));
// …compare against MAP_PALETTE_LIGHT.land parsed out of the .ts source
```

**Measure a ceiling as well as a floor.** That build caps every authored dark-palette colour at
`#A6C4D6` by luminance, because above it the glass panel's alpha bound moves out of translucency
altogether. A gate that only knows about minimums cannot see a brightness budget being spent.

## Exit codes

| exit | meaning |
|---|---|
| 0 | every required pair passed |
| 1 | at least one required pair failed |
| 2 | the script could not resolve something and therefore **did not check** |

Exit 2 is the point of the file. `CANNOT CHECK: no [data-surface="daylight"] block found` must never
look like "zero failures". A pair that threw is counted as an error, not as a pass.

## What it handles

- `var(--x)` and `var(--x, fallback)`, recursively, with a 24-deep cycle guard that throws.
- `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`.
- `rgb()` / `rgba()` in the 0-to-255 domain, with percentages.
- `color(srgb r g b / a)` in the 0-to-1 domain.
- `color-mix(in srgb | oklab | oklch, A p%, B p%)`, including one-sided percentages and
  normalisation when they do not sum to 100. Oklab mixing goes through a real sRGB-to-Oklab-to-sRGB
  round trip, not a linear RGB shortcut.
- Alpha compositing of a translucent foreground onto an opaque ground, and a **throw** when the
  BACKGROUND is translucent, because a ratio against a translucent ground is not a real number.
- WCAG 2.x relative luminance and ratio; floors 4.5 (text) and 3.0 (WCAG 1.4.11 non-text and control
  borders).

## Decoration is measured and reported but deliberately NOT gated

Decorative hairlines and tints are printed in their own section with their real ratios and a note,
outside the pass/fail set. This keeps the number on the record without inviting someone to "fix" a
hairline by darkening it to 4.5:1 and wrecking the design. The rule that stays gated: **a decorative
value may never bound a control.**

## Assumes / adapt

- Node 18+, zero dependencies, ES modules. `node contrast.mjs <file.html|file.css>`.
- **It reads one hard-coded selector**, `[data-surface="daylight"]`, and one hard-coded pairs list
  (16 rows named after that wave's surfaces). Change both. The selector regex is
  `/\[data-surface=["']daylight["']\]\s*\{([\s\S]*?)\}/`; point it at your own token block, whether
  that is `:root`, `@theme`, or a named surface scope.
- It reads a single flat block. It does not cascade, does not do media queries, and does not
  evaluate a dark-mode override block. For a two-theme token set, run it twice against the two
  blocks.
- It parses CSS text, so it sees the AUTHORED value. It does not run a browser, so it cannot catch a
  ratio produced by an image behind text or by an unexpected inherited background.
- Keep the calibration rows when you adapt it. A KNOWN-FAIL row tied to a token you deleted is the
  quickest way to turn this back into a decorative green.

## Related

- [`../verification/control-first-check.md`](../verification/control-first-check.md), the parent
  shape: a check that runs its own control first and refuses to report when the control does not
  fire.
- [`../offline-native-app/status-type-design-tokens.md`](../offline-native-app/status-type-design-tokens.md)
  FIXES translucent-badge contrast; this file MEASURES it. Use them together.
- [`../vite-react-supabase/editorial-frontpage-system.md`](../vite-react-supabase/editorial-frontpage-system.md)
  requires every text token to be AA-verified numerically. This is the thing that verifies it.

**A note on the two copies on disk.** `ui-craft/_lib/contrast.mjs` (435 lines) and
`verification/_gates/contrast.mjs` (491 lines) are **different files**, not a copy. `_gates/` is the
runnable gate; `_lib/` is the drop-in. Diff them before adapting either, and if you improve one,
port the fix rather than leaving a third variant.

Verified at harvest, 2026-09-13: run against the wave's built document, all four calibration rows
printed `AS EXPECTED` (KNOWN-FAIL 1.29:1, KNOWN-PASS 17.25:1, color-mix 1.00:1, identity 1.00:1) and
16 of 16 required pairs passed, exit 0.
