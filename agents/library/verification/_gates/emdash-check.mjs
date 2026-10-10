// Em-dash detector WITH A NEGATIVE CONTROL, in two tiers.
//
// Why this shape: `grep -P` errors on this machine and its error reads as a clean
// pass. A detector that cannot fail is not evidence. So this script FIRST runs
// itself against known-positive strings and a known-clean string. If the control
// does not fire, it exits non-zero and refuses to report on anything else.
//
// TIER 1 (BLOCKING): literal em dash, literal en dash, and every HTML entity
//   spelling of both. These are never legitimate in Elevare copy.
// TIER 2 (REVIEW): the "--" digraph used as a dash. This one has legitimate
//   non-dash uses in source code, so the exclusions are NAMED and PRINTED
//   rather than applied silently, and every surviving hit is shown in context
//   so a human judges it. A silent exclusion is how a detector stops detecting.
//
// Usage: node emdash-check.mjs <path> [<path> ...]
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";

const TIER1 = [
  { name: "U+2014 EM DASH (literal)", re: /—/g },
  { name: "U+2013 EN DASH (literal)", re: /–/g },
  { name: "&mdash; entity", re: /&mdash;/gi },
  { name: "&ndash; entity", re: /&ndash;/gi },
  { name: "&#8212; decimal entity", re: /&#8212;?/g },
  { name: "&#8211; decimal entity", re: /&#8211;?/g },
  { name: "&#x2014; hex entity", re: /&#x2014;?/gi },
  { name: "&#x2013; hex entity", re: /&#x2013;?/gi },
];
const TIER2 = { name: '"--" digraph used as a dash', re: /(?<=\S)\s?--\s?(?=\S)/g };

// NAMED exclusions for TIER 2 only. Printed on every run so they are auditable.
const TIER2_EXCLUSIONS = [
  { name: "markdown horizontal rule / comment rule (a line that is only dashes)", test: (line) => /^\s*(\/\/|#|\*)?\s*-{3,}\s*$/.test(line) },
  { name: "CSS custom property, e.g. var(--token) or --token:", test: (_l, ctx) => /[(:;\s{]--[a-z]/i.test(ctx) },
  { name: "command-line long flag, e.g. --max-time", test: (_l, ctx) => /(?:^|\s)--[a-z][a-z0-9-]*/i.test(ctx) },
  { name: "decrement or a run of dashes inside a string of dashes", test: (_l, ctx) => /-{3,}/.test(ctx) },
];

// Files whose JOB is to contain the forbidden characters. Listed, never inferred.
const SELF_EXEMPT = new Set(["emdash-check.mjs"]);

function lineAt(text, idx) {
  const s = text.lastIndexOf("\n", idx) + 1;
  let e = text.indexOf("\n", idx);
  if (e < 0) e = text.length;
  return { line: text.slice(s, e), lineNo: text.slice(0, idx).split("\n").length };
}

function scanTier1(text) {
  const hits = [];
  for (const p of TIER1) {
    for (const m of text.matchAll(p.re)) {
      const { line, lineNo } = lineAt(text, m.index);
      hits.push({ pattern: p.name, lineNo, line: line.trim().slice(0, 140) });
    }
  }
  return hits;
}

function scanTier2(text) {
  const kept = [];
  const excluded = [];
  for (const m of text.matchAll(TIER2.re)) {
    const { line, lineNo } = lineAt(text, m.index);
    const ctx = text.slice(Math.max(0, m.index - 24), m.index + 24);
    const ex = TIER2_EXCLUSIONS.find((x) => x.test(line, ctx));
    if (ex) excluded.push({ lineNo, rule: ex.name });
    else kept.push({ lineNo, line: line.trim().slice(0, 140), ctx: ctx.replace(/\n/g, " ") });
  }
  return { kept, excluded };
}

// --------------------------- CONTROL ----------------------------------------
const CONTROLS = [
  { pattern: "U+2014 EM DASH (literal)", text: "this is a test — with an em dash" },
  { pattern: "U+2013 EN DASH (literal)", text: "pages 10–20 of the report" },
  { pattern: "&mdash; entity", text: "a test &mdash; entity" },
  { pattern: "&ndash; entity", text: "pages 10&ndash;20" },
  { pattern: "&#8212; decimal entity", text: "a test &#8212; decimal" },
  { pattern: "&#8211; decimal entity", text: "pages 10&#8211;20" },
  { pattern: "&#x2014; hex entity", text: "a test &#x2014; hex" },
  { pattern: "&#x2013; hex entity", text: "pages 10&#x2013;20" },
];
const CLEAN = "This sentence is clean: it uses a colon, a comma, and a full stop. Ranges use 10 to 20.";
const T2_CONTROL = "this is a test -- with a digraph";

console.log("=".repeat(74));
console.log("NEGATIVE CONTROL: can this detector actually fail?");
console.log("=".repeat(74));
let allFired = true;
for (const c of CONTROLS) {
  const fired = scanTier1(c.text).some((h) => h.pattern === c.pattern);
  if (!fired) allFired = false;
  console.log(`  ${fired ? "FIRED       " : "DID NOT FIRE"}  ${c.pattern}`);
  console.log(`                  on ${JSON.stringify(c.text)}`);
}
const t2fired = scanTier2(T2_CONTROL).kept.length > 0;
if (!t2fired) allFired = false;
console.log(`  ${t2fired ? "FIRED       " : "DID NOT FIRE"}  ${TIER2.name}`);
console.log(`                  on ${JSON.stringify(T2_CONTROL)}`);

const fp1 = scanTier1(CLEAN).length;
const fp2 = scanTier2(CLEAN).kept.length;
console.log(`\n  False positives on a known-clean string: tier1=${fp1} tier2=${fp2} (both must be 0)`);
console.log(`                  on ${JSON.stringify(CLEAN)}`);

if (!allFired || fp1 || fp2) {
  console.log("\n  CONTROL FAILED. This detector cannot be trusted. Refusing to report.");
  process.exit(2);
}
console.log("\n  CONTROL PASSED: 9 of 9 patterns fire on known-positives, 0 on a known-clean.");
console.log("  A zero result below is therefore evidence, not silence.");

console.log("\n  TIER 2 exclusions in force (printed so they are auditable, never silent):");
for (const x of TIER2_EXCLUSIONS) console.log(`    - ${x.name}`);
console.log(`  Self-exempt files (their job is to contain the characters): ${[...SELF_EXEMPT].join(", ")}`);

// --------------------------- SCAN -------------------------------------------
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next"]);
const TEXTY = new Set([".md", ".mdx", ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".txt", ".svg", ".sql", ".py", ".ps1", ".sh", ".yml", ".yaml", ".toml", ".xml", ".csv"]);
// 2026-09-14: .sql was added earlier tonight after the gate scanned ZERO migration files and printed CLEAN;
// .py, .ps1, .sh, .yml/.yaml, .toml, .xml, .csv, .cjs, .mdx added the same night after two Python tools in
// elevare-app/store/tools were found never to have been read. A type missing from this set is a file the
// gate silently never opens; extend it, never narrow it.
function walk(p, acc = []) {
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const e of readdirSync(p)) {
      if (SKIP_DIRS.has(e)) continue;
      walk(join(p, e), acc);
    }
  } else if (TEXTY.has(extname(p).toLowerCase())) acc.push(p);
  return acc;
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.log("\nNo paths given. Control ran only.");
  process.exit(0);
}
let files = [];
for (const t of targets) files = files.concat(walk(t));

let t1Total = 0,
  t2Total = 0,
  exTotal = 0;
const bad = [];
for (const f of files) {
  if (SELF_EXEMPT.has(basename(f))) continue;
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  const h1 = scanTier1(text);
  const { kept, excluded } = scanTier2(text);
  exTotal += excluded.length;
  if (h1.length || kept.length) {
    bad.push({ f, h1, kept });
    t1Total += h1.length;
    t2Total += kept.length;
  }
}

console.log("\n" + "=".repeat(74));
console.log(`SCAN: ${files.length} file(s); ${exTotal} tier-2 hit(s) excluded by the named rules above`);
console.log("=".repeat(74));
if (!bad.length) {
  console.log(`  TIER 1 (blocking): 0 occurrences.`);
  console.log(`  TIER 2 (review):   0 occurrences.`);
  console.log(`  CLEAN across ${files.length} files.`);
} else {
  for (const b of bad) {
    console.log(`\n  ${b.f}`);
    for (const h of b.h1) console.log(`    TIER1  L${h.lineNo}  ${h.pattern}\n           ${h.line}`);
    for (const k of b.kept) console.log(`    TIER2  L${k.lineNo}  ...${k.ctx}...`);
  }
  console.log(`\n  TIER 1 (blocking): ${t1Total}`);
  console.log(`  TIER 2 (review):   ${t2Total}`);
}
process.exit(t1Total ? 1 : 0);
