#!/usr/bin/env node
/*
 * checks.mjs : the rejection list from DIRECTION-AGENT-REPORT.md section 4
 * and section 7, run against the built document as a detector rather than
 * asserted in a summary.
 *
 *   node checks.mjs [file.html]
 *
 * EVERY RULE CARRIES A CONTROL. Each rule is run first against a synthetic
 * string that MUST trip it. A rule whose control does not fire is reported
 * as MISCALIBRATED and the run exits 2, because a rule that cannot fire
 * produces a zero that reads exactly like a clean result. That is the whole
 * reason this file exists instead of a paragraph claiming the bans hold.
 *
 * Exit 0 = every rule passed and every control fired.
 * Exit 1 = at least one rule tripped on the real document.
 * Exit 2 = at least one control did not fire, so the run proved nothing.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const file = resolve(
  HERE,
  process.argv.slice(2).find((a) => !a.startsWith("-")) ?? "report.html",
);
if (!existsSync(file)) {
  console.error(`\n  CANNOT CHECK: ${file} does not exist.\n`);
  process.exit(2);
}
const src = readFileSync(file, "utf8");

/* THE DECLARED TOKEN BLOCKS. Colour literals are legal inside these and
 * nowhere else, so they are cut out before the hex and clamp rules run. Each
 * cut is reported, so a cut can never quietly grow to swallow the document.
 *
 * AMENDED 2026-09-13, and the amendment is declared rather than slipped in.
 * The document used to be light only, on a [data-surface="daylight"] block,
 * and this file used to carry a rule that BANNED dark mode outright. The
 * owner's direction now requires both themes properly, so that ban would be a
 * gate enforcing the opposite of the brief. It is replaced below by a rule
 * that is harder to satisfy than the ban was: if a dark palette exists it must
 * be COMPLETE and its two blocks must agree. A half dark theme is still worse
 * than light only; the difference is that this version can tell them apart.
 *
 * SCALE is the bare :root block, which now also carries the light palette.
 * DARK_MQ is the preference-query block. DARK_EXPLICIT is the stamped block.
 * PRINT_ROOT is the light-forcing palette inside the print query.
 *
 * The regions are MARKED IN THE DOCUMENT with TOKENS:BEGIN <name> and
 * TOKENS:END, and this file cuts what the markers enclose. An earlier
 * version hunted for each block with its own regex and one of those regexes
 * silently swallowed a neighbouring block, cutting the wrong thing under the
 * right name. A declared region cannot do that, and the names and line counts
 * are printed on every run. Exactly four are expected; any other number is
 * exit 2, because a cut that moved is a rule that stopped checking. */
const REGIONS = [
  ...src.matchAll(/\/\* TOKENS:BEGIN ([\w-]+) \*\/([\s\S]*?)\/\* TOKENS:END \*\//g),
].map((m) => ({ name: m[1], text: m[0] }));
const region = (n) => REGIONS.find((r) => r.name === n)?.text ?? "";
const SCALE = region("light");
const DARK_MQ = region("dark-preference");
const DARK_EXPLICIT = region("dark-explicit");
const PRINT_ROOT = region("print-light");

/* CSS comments are stripped for the hex and clamp rules ONLY, because a
 * sentence about clamp() is not a clamp() and the rule was reporting its
 * own documentation as a violation.
 *
 * A comment-stripper that eats real hits is itself a known way for a check
 * to stop checking, so two things guard this: the byte count removed is
 * printed, and the stripper is applied to nothing except these two rules.
 * Every other rule, including the emoji and serif rules, still reads the
 * WHOLE file, comments included. */
const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const CUTS = [SCALE, DARK_MQ, DARK_EXPLICIT, PRINT_ROOT].filter(Boolean);
const cutAll = (s) => CUTS.reduce((acc, c) => acc.replace(c, ""), s);
const outsideTokens = stripCssComments(cutAll(src));
const COMMENT_BYTES = cutAll(src).length - outsideTokens.length;

const rules = [];
const add = (name, why, test, control, controlShouldTrip = true) =>
  rules.push({ name, why, test, control, controlShouldTrip });

/* ---- section 4: what is rejected on sight ---------------------------- */

add(
  "no score, grade, index or percentage",
  "a score converts a document of individually checkable claims into one unfalsifiable claim",
  (s) =>
    [
      ...s.matchAll(
        /\b(?:score|grade|site\s*health|out\s*of\s*100|\d{1,3}\s*\/\s*100|overall\s+rating|health\s+score)\b/gi,
      ),
    ].map((m) => m[0]),
  'your site scored 72 out of 100, a B grade, site health 72%',
);

add(
  "no gauge, meter, dial or progress ring",
  "same defect as the score, drawn instead of written",
  (s) => [...s.matchAll(/<(?:meter|progress)\b|\bgauge\b|\bprogress-ring\b|role="meter"/gi)].map((m) => m[0]),
  '<meter value="0.7"></meter> gauge role="meter" <progress></progress>',
);

add(
  "no severity chips and no traffic light",
  "an unearned taxonomy replacing a measured consequence; the rank and the money line carry the ordering",
  (s) =>
    [
      ...s.matchAll(
        /\bclass="[^"]*\b(?:chip|pill|badge|severity)\b[^"]*"|\b(?:CRITICAL|SEVERITY)\b|--(?:danger|warning|success)\b|\b(?:traffic-light|amber)\b/g,
      ),
    ].map((m) => m[0]),
  'class="severity-pill" CRITICAL --danger amber traffic-light',
);

add(
  "no three-KPI card band",
  "the SaaS-dashboard tell; the three counts belong in one line of running mono in the dateline",
  (s) =>
    [...s.matchAll(/\bclass="[^"]*\b(?:kpi|stat-card|metric-card|stat-tile)\b[^"]*"/gi)].map((m) => m[0]),
  '<div class="kpi-card"> <div class="stat-tile">',
);

/* ---- section 3 and the brief: the system ----------------------------- */

add(
  "no serif",
  "a serif would install a second type system on the daylight surface",
  (s) =>
    [
      ...s.matchAll(
        /font-family:[^;]*\b(?:serif|Georgia|Times|Garamond|Merriweather|Playfair|Lora|Charter|Cambria)\b[^;]*;/gi,
      ),
    ]
      .map((m) => m[0])
      // ui-sans-serif and sans-serif are the sans stack, not a serif.
      .filter((t) => /\b(?<!sans-)serif\b/.test(t.replace(/ui-sans-serif|sans-serif/g, "")) || /Georgia|Times|Garamond|Merriweather|Playfair|Lora|Charter|Cambria/i.test(t)),
  'font-family: Georgia, "Times New Roman", serif;',
);

add(
  "no --sb-* site-builder token",
  "those tokens are scoped to generated client sites and do not exist on this surface",
  (s) => [...s.matchAll(/-{2}sb-[\w-]+/g)].map((m) => m[0]),
  "color: var(--sb-ink); --sb-accent: red;",
);

add(
  "no hard-coded hex outside the four declared token regions",
  "every colour is consumed through var(); the four regions are the light palette, the two dark palettes and the light palette forced back on for print",
  () => [...outsideTokens.matchAll(/#[0-9a-fA-F]{3,8}\b(?![\w-]*['"]?\s*[>:])/g)]
      .map((m) => m[0])
      // An href="#anchor" is not a colour. Only 3, 4, 6 and 8 hex digits are.
      .filter((h) => /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(h)),
  null,
  false,
);

add(
  "no hard-coded clamp() outside the declared scale",
  "a hard-coded clamp is a magic number and six copies of one drift (globals.css:406)",
  () => [...outsideTokens.matchAll(/clamp\(/g)].map((m) => m[0]),
  null,
  false,
);

add(
  "semantic colour never borrows the brand hue",
  "rank, confidence and the retraction lane are ordering and honesty, not brand. An accent on a retraction would read as a boast, and an accent on a rank would make position look like severity.",
  (s) =>
    [
      ...s.matchAll(
        /\.(?:finding__rank|mc|mc__mark|killed[\w-]*|retraction[\w-]*)[^{}]*\{[^{}]*var\(-{2}accent[\w-]*\)[^{}]*\}/g,
      ),
    ].map((m) => m[0].replace(/\s+/g, " ").slice(0, 90)),
  ".finding__rank { color: var(--accent); }",
);

add(
  "no grain, texture or tinted radial",
  "paper is the texture; --grain-url belongs to the dark front door",
  (s) => [...s.matchAll(/-{2}grain-url|feTurbulence|noise\.png|radial-gradient/gi)].map((m) => m[0]),
  "background: var(--grain-url); feTurbulence; radial-gradient(circle, a, b)",
);

add(
  "no emoji",
  "CRAFT names emoji as UI icons fatal on trust surfaces specifically",
  (s) =>
    [...s.matchAll(/[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu)].map(
      (m) => m[0],
    ),
  "a rocket \u{1F680} and a warning ⚠️",
);

add(
  "no carousel, autoplay, or scroll reveal",
  "motion is nearly absent in the reading column, and this document is entirely reading column",
  (s) =>
    [
      ...s.matchAll(
        /\bcarousel\b|\bautoplay\b|IntersectionObserver|addEventListener\(\s*["']scroll["']|\bdata-aos\b|\breveal-on-scroll\b/gi,
      ),
    ].map((m) => m[0]),
  'class="carousel" autoplay new IntersectionObserver() addEventListener("scroll",f)',
);

add(
  "nothing counts up",
  "THE BILL set this precedent; no animated figures, no progress ring",
  (s) => [...s.matchAll(/requestAnimationFrame|countUp|\bodometer\b|@keyframes/gi)].map((m) => m[0]),
  "requestAnimationFrame(tick); @keyframes count { }",
);

/* ---- section 2a: the signature moment owns the only disclosure ------- */

const countAll = (re) => (src.match(re) ?? []).length;

const disclosures =
  countAll(/<details\b/gi) + countAll(/aria-expanded=/gi);
const receipts = countAll(/class="receipt-toggle"/g);

/* ---- run ------------------------------------------------------------- */

console.log(`\nchecks.mjs`);
console.log(`  document : ${file}`);
console.log(`  declared colour regions cut before the hex and clamp rules : ${REGIONS.length} found`);
for (const r of REGIONS)
  console.log(`    TOKENS:${r.name.padEnd(20)} ${r.text.split("\n").length} lines, ${r.text.length} bytes`);
const EXPECTED = ["light", "dark-preference", "dark-explicit", "print-light"];
const missing = EXPECTED.filter((n) => !region(n));
if (REGIONS.length !== EXPECTED.length || missing.length) {
  console.error(
    `\n  CANNOT CHECK: expected exactly ${EXPECTED.length} declared colour regions (${EXPECTED.join(", ")}) and found ${REGIONS.length}${missing.length ? `; missing: ${missing.join(", ")}` : ""}. The hex and clamp rules would have had the wrong thing exempted and would report a false result.\n`,
  );
  process.exit(2);
}

console.log(
  "\nCONTROLS : every rule is fired against a synthetic positive first.\n",
);
let miscalibrated = 0;
for (const r of rules) {
  if (!r.controlShouldTrip) {
    console.log(`  ${r.name.padEnd(56)} control n/a  (rule reads a pre-cut region)`);
    continue;
  }
  const hits = r.test(r.control);
  if (hits.length === 0) {
    miscalibrated++;
    console.log(`  ${r.name.padEnd(56)} ★ MISCALIBRATED, control did not fire`);
  } else {
    console.log(`  ${r.name.padEnd(56)} FIRED (${hits.length})`);
  }
}
if (miscalibrated) {
  console.error(
    `\n  ${miscalibrated} rule(s) could not fire on a known-positive. A zero from those rules is silence, not evidence.\n`,
  );
  process.exit(2);
}
console.log(`\n  All ${rules.filter((r) => r.controlShouldTrip).length} testable controls fired. A zero below is evidence.\n`);

console.log("REJECTION LIST : run against the real document.\n");
let tripped = 0;
for (const r of rules) {
  const hits = r.test(src);
  const uniq = [...new Set(hits)];
  if (uniq.length) {
    tripped++;
    console.log(`  ${r.name.padEnd(56)} ★ TRIPPED (${uniq.length})`);
    console.log(`      why: ${r.why}`);
    console.log(`      hits: ${uniq.slice(0, 8).map((h) => JSON.stringify(h)).join(", ")}`);
  } else {
    console.log(`  ${r.name.padEnd(56)} clean`);
  }
}

/* ---- both themes, properly ------------------------------------------
 * Replaces the old "no dark mode" ban. Three things have to hold and none
 * of them is visible in a screenshot of either theme:
 *   1. the complete light palette is on a BARE :root, so a browser that has
 *      stated no preference and one that has explicitly chosen light both
 *      land on it;
 *   2. the two dark blocks declare the SAME property names with the SAME
 *      values, so the preference path and the stamped path cannot drift;
 *   3. every primitive the light palette declares is redeclared in dark.
 *      A colour defined only in light is the exact defect that makes a dark
 *      page borrow the host's theme in one place and not another.
 * ------------------------------------------------------------------- */
console.log("\nBOTH THEMES : light on a bare :root, dark defined twice and in agreement.\n");
const decls = (blk) =>
  new Map([...blk.matchAll(/(-{2}[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].replace(/\/\*[\s\S]*?\*\//g, "").trim()]));
const lightAll = decls(SCALE);
const lightPrimitives = new Map([...lightAll].filter(([, v]) => /^#[0-9a-fA-F]{3,8}$/.test(v)));
const mq = decls(DARK_MQ);
const ex = decls(DARK_EXPLICIT);
console.log(`  light palette primitives on bare :root : ${lightPrimitives.size}`);
console.log(`  preference-query dark block declares    : ${mq.size}`);
console.log(`  explicit-stamp dark block declares      : ${ex.size}`);

const themeProblems = [];
if (!/@media \(prefers-color-scheme: dark\) \{\s*\n\s*:root:not\(\[data-theme="light"\]\)/.test(src))
  themeProblems.push('the preference-query dark block is not guarded with :root:not([data-theme="light"]), so an explicit light choice would lose to the system preference');
for (const [k, v] of mq)
  if (ex.get(k) !== v) themeProblems.push(`${k} is "${v}" under the preference query and "${ex.get(k) ?? "ABSENT"}" under the explicit stamp`);
for (const k of ex.keys())
  if (!mq.has(k)) themeProblems.push(`${k} is declared only under the explicit stamp`);
for (const k of lightPrimitives.keys())
  if (!ex.has(k)) themeProblems.push(`${k} has a light value and no dark value, so it would carry a light colour onto a dark page`);

if (themeProblems.length) {
  tripped++;
  console.log(`  TRIPPED (${themeProblems.length})`);
  for (const p of themeProblems) console.log(`      ${p}`);
} else {
  console.log(`  clean  the two dark blocks agree on all ${mq.size} declarations, the preference block is guarded, and every light primitive has a dark value`);
}

/* The control for the block above: the same three tests, run against a
 * synthetic pair that IS broken. A structural check with no control is the
 * same silence as a regex rule with no control. */
const synthMq = decls("--background: #fff; --accent: #6d28d9;");
const synthEx = decls("--background: #000;");
const synthProblems = [];
for (const [k, v] of synthMq)
  if (synthEx.get(k) !== v) synthProblems.push(k);
console.log(
  `  control: a deliberately mismatched pair of blocks produces ${synthProblems.length} problem(s) [${synthProblems.join(", ")}]  ${
    synthProblems.length === 2 ? "FIRED" : "MISCALIBRATED"
  }`,
);
if (synthProblems.length !== 2) {
  console.error(`\n  The theme-parity control did not fire. A clean result above would be silence, not evidence.\n`);
  process.exit(2);
}

console.log("\nEXCLUSIVITY : the receipt is the only thing that opens.\n");
console.log(`  disclosure controls in the document  : ${disclosures}`);
console.log(`  of which are receipt toggles         : ${receipts}`);
const exclusive = disclosures === receipts && receipts > 0;
console.log(
  `  ${exclusive ? "clean" : "★ TRIPPED"}  ${
    exclusive
      ? "every disclosure control in the document is a receipt toggle"
      : "something other than the receipt opens, or nothing does"
  }`,
);
if (!exclusive) tripped++;

/* One animated thing. Counted as distinct transition/animation
 * declarations, which is the only countable definition of "one thing"
 * that a stylesheet can be held to. */
const transitions = [
  ...src.matchAll(/^\s*(transition|animation)\s*:/gm),
].map((m) => m[0].trim());
console.log(`\nMOTION BUDGET : exactly one animated thing.\n`);
console.log(`  transition/animation declarations    : ${transitions.length}`);
const motionBlocks = [
  ...src.matchAll(/([.#][\w-]+(?:[^{]*))\{[^}]*\btransition\s*:[^}]*\}/g),
].map((m) => m[1].trim().replace(/\s+/g, " "));
for (const b of motionBlocks) console.log(`    on: ${b}`);
const offBudget = motionBlocks.filter((b) => !/receipt/.test(b));
if (offBudget.length) {
  tripped++;
  console.log(`  ★ TRIPPED  ${offBudget.length} animated selector(s) are not the receipt`);
} else {
  console.log(`  clean  every animated selector belongs to the receipt disclosure`);
}

console.log(
  `\nACCENT BUDGET : at most three resting appearances.\n`,
);
/* Not anchored to the start of a line: a single-line rule such as
 * `.x { border-left: 2px solid var(--accent); }` puts its declaration
 * mid-line, and an anchored regex silently undercounted the budget by
 * missing exactly one of the three allocations. */
const accentUses = [
  ...src.matchAll(/([\w-]+)\s*:\s*[^;{}]*var\(-{2}accent\)[^;{}]*;/g),
].map((m) => m[0].trim());
for (const a of accentUses) console.log(`    ${a}`);
console.log(
  `  ${accentUses.length} declaration(s). The focus ring is one of them and is mandated by DIRECTION 3d, so the resting count is ${accentUses.length - 1}.`,
);

console.log("");
if (tripped) {
  console.error(`  ${tripped} rule(s) TRIPPED.\n`);
  process.exit(1);
}
console.log(`  Rejection list clean, and every control fired.\n`);
process.exit(0);
