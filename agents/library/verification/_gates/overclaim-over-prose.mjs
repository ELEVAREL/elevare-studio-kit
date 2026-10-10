#!/usr/bin/env node
/*
 * overclaim-run.mjs : run the unfalsifiable-claim gate over the PROSE of the
 * built document rather than over the pipeline's JSON.
 *
 * Why this exists. The gate in generator/overclaim.mjs reads a report object
 * and checks the fields a model authored. That is the right scope when the
 * pipeline is the thing being gated. It is the wrong scope when a human has
 * rewritten the document by hand afterwards, because the JSON no longer is
 * the document. This runner closes that gap: it reads the shipped HTML, cuts
 * out the code-authored regions (the proof panels, and the "how we tested it"
 * line under each retraction), and runs the identical RULES over everything
 * that is left.
 *
 * The cut is reported in bytes so it cannot quietly grow to swallow the copy.
 *
 * NOTE for the library copy: it imports ./overclaim.mjs, the RULES module that
 * sits beside it here. In the project it lived at ../generator/overclaim.mjs.
 *
 * Step 1 is always the gate's own calibration. A rule set that cannot fire is
 * not a gate, and a clean result from one is silence.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runCalibration, findOverclaims } from "./overclaim.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const file = resolve(HERE, process.argv[2] ?? "report.html");

console.log("=".repeat(74));
console.log("CALIBRATION : the committed dirty and clean fixtures.");
console.log("=".repeat(74));
const cal = runCalibration();
const dirtySilent = cal.dirty.filter((d) => !d.fired);
const cleanNoisy = cal.clean.filter((c) => !c.clean);
console.log(`  dirty fixtures that fired      : ${cal.dirty.length - dirtySilent.length} of ${cal.dirty.length}`);
console.log(`  clean fixtures that stayed clean: ${cal.clean.length - cleanNoisy.length} of ${cal.clean.length}`);
for (const d of dirtySilent) console.log(`    DID NOT FIRE: ${JSON.stringify(d.text)}`);
for (const c of cleanNoisy) console.log(`    FALSE RED   : ${JSON.stringify(c.text)} on ${JSON.stringify(c.matched)}`);
if (!cal.ok) {
  console.error("\n  CALIBRATION FAILED. Refusing to report on the document.\n");
  process.exit(2);
}
console.log("  CALIBRATION PASSED. A zero below is evidence, not silence.\n");

const src = readFileSync(file, "utf8");

/* Code-authored regions, cut by name. The proof panels quote real probes and
 * legitimately contain words like "telephone"; the retraction's method line is
 * a description of what was run. Neither is prose the model or the writer
 * chose, and a gate wider than the invariant fails on correct content. */
const cuts = [
  { name: "proof panels", re: /<div class="receipt"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g },
  { name: '"how we tested it" lines', re: /<p class="killed__probe">[\s\S]*?<\/p>/g },
];
let body = src;
for (const c of cuts) {
  const before = body.length;
  body = body.replace(c.re, "");
  console.log(`  cut ${c.name.padEnd(26)} ${before - body.length} bytes`);
}

/* Visible prose only: drop the whole <head>, every remaining tag, and the
 * style/script blocks, then decode the handful of entities the document uses. */
const text = body
  .replace(/<head[\s\S]*?<\/head>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&lsquo;|&rsquo;/g, "'")
  .replace(/&middot;/g, ".")
  .replace(/&amp;/g, "&")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

console.log(`  prose checked                  : ${text.length} characters\n`);

/* findOverclaims takes a report object. Handing it the prose as one headline
 * is the whole document in one field, which is exactly what we want gated. */
const hits = findOverclaims({
  report: { headline: text, verdict: "", what_is_already_right: [] },
  findings: [],
  decision: {},
});

console.log("=".repeat(74));
console.log(`OVERCLAIM SWEEP : ${file}`);
console.log("=".repeat(74));
if (!hits.length) {
  console.log("  0 unfalsifiable claims in the prose of the shipped document.\n");
  process.exit(0);
}
for (const h of hits) {
  console.log(`\n  ${h.kind}`);
  console.log(`    matched : ${JSON.stringify(h.matched)}`);
  console.log(`    context : ...${h.context.trim()}...`);
  console.log(`    why     : ${h.why}`);
}
console.log(`\n  ${hits.length} overclaim(s).\n`);
process.exit(1);
