#!/usr/bin/env node
/*
 * jargon.mjs : the owner's banned-terms list, as a detector rather than as a
 * promise in a summary.
 *
 * The list is his, verbatim, from the 2026-09-13 direction. It runs over the
 * VISIBLE PROSE of the shipped document, head and style and script removed,
 * because a word in a CSS comment is not a word the buyer reads and a gate
 * wider than the invariant invites someone to damage the source to satisfy it.
 * The proof panels are IN scope: the owner's point was that the panels read
 * like shell commands, so exempting them would exempt the actual defect.
 *
 * Every term carries a control: the term is first matched against a synthetic
 * sentence that contains it. A term whose control does not fire is reported as
 * miscalibrated and the run exits 2.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const file = resolve(HERE, process.argv[2] ?? "report.html");

const TERMS = [
  { re: /\bregex\b|\bsweep of every page\b/i, control: "a regex sweep of every page" },
  { re: /\bimg tags?\b|\bCSS background images?\b/i, control: "zero img tags, zero CSS background images" },
  { re: /\bJSON-?LD\b/i, control: "45 JSON-LD blocks" },
  { re: /\bautocomplete attribute\b|\bautocomplete=/i, control: "the autocomplete attribute is missing" },
  { re: /(?:^|[\s>(])h1(?:[\s<),.]|$)/i, control: "the h1 diverges" },
  { re: /\bhydrat(?:e|es|ed|ion)\b|JavaScript-rendered/i, control: "after the page hydrates" },
  { re: /\bnoscript\b/i, control: "the noscript fallback" },
  { re: /\bschema markup\b|\bsameAs\b|\bAggregateRating\b/i, control: "schema markup with sameAs and AggregateRating" },
  { re: /window\.fetch|XMLHttpRequest|\bstub\b/i, control: "stub window.fetch and XMLHttpRequest.prototype.send" },
  { re: /\btap targets?\b|44-pixel|44 pixel/i, control: "tap targets meet the 44-pixel minimum" },
  { re: /\bedge cache\b/i, control: "served from edge cache" },
  { re: /robots\.txt|llms\.txt|\bGPTBot\b|ChatGPT-User|Google-Extended|PerplexityBot/i, control: "robots.txt and llms.txt allow GPTBot" },
  { re: /\bquerySelectorAll\b|\binnerText\b|\bDOM\b/i, control: "querySelectorAll over the DOM innerText" },
  { re: /\bsitemap\b/i, control: "the sitemap declares eight routes" },
  { re: /\bprobes? run\b|\bprobe\b/i, control: "20 probes run" },
];

const src = readFileSync(file, "utf8");
const text = src
  .replace(/<head[\s\S]*?<\/head>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&lsquo;|&rsquo;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

console.log(`\njargon.mjs`);
console.log(`  document     : ${file}`);
console.log(`  prose checked: ${text.length} characters of what the buyer actually reads\n`);

console.log("CONTROLS : every term fired against a sentence that contains it.\n");
let miscal = 0;
for (const t of TERMS) {
  const fired = t.re.test(t.control);
  if (!fired) miscal++;
  console.log(`  ${(fired ? "FIRED       " : "DID NOT FIRE")}  ${String(t.re)}`);
}
if (miscal) {
  console.error(`\n  ${miscal} term(s) could not fire on a known-positive. Refusing to report.\n`);
  process.exit(2);
}
console.log(`\n  All ${TERMS.length} controls fired. A zero below is evidence.\n`);

console.log("SWEEP : run against the shipped prose.\n");
let hits = 0;
for (const t of TERMS) {
  const m = text.match(new RegExp(t.re.source, "gi"));
  if (m) {
    hits += m.length;
    console.log(`  TRIPPED  ${String(t.re)}  ${JSON.stringify([...new Set(m)].slice(0, 6))}`);
  }
}
if (!hits) console.log(`  0 banned terms in the prose. All ${TERMS.length} terms checked.\n`);
else console.log(`\n  ${hits} banned term occurrence(s).\n`);
process.exit(hits ? 1 : 0);
