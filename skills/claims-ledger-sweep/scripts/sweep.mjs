#!/usr/bin/env node
/**
 * claims-ledger-sweep — find COMMENTS that assert a control living OUTSIDE the
 * file they are written in, with nothing a reader can follow to check it.
 *
 * The gate is SCOPE, not vocabulary. A comment explaining the code directly
 * beneath it is not a claim anyone needs to go verify; a comment asserting what
 * some *other* file does is unverifiable by construction unless it cites one.
 *
 *   node sweep.mjs [dir] [--changed <git-ref>] [--min low|medium|high|critical]
 *                        [--docs] [--all] [--json]
 *
 * Exit 0 always. This tool NOMINATES lines for a human read. It never verdicts.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : null);
const root = path.resolve(argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--changed" && argv[argv.indexOf(a) - 1] !== "--min") ?? ".");
const OPT = { docs: flag("docs"), json: flag("json"), all: flag("all"), changed: val("changed"), min: (val("min") || "high").toLowerCase() };

const SKIP_DIR = /^(node_modules|\.git|\.next|\.turbo|dist|build|out|coverage|vendor|\.venv|__pycache__|\.vercel|generated)$/;
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".sql", ".py", ".go", ".rs", ".rb", ".php", ".sh", ".yml", ".yaml"]);
const DOC_EXT = new Set([".md", ".mdx"]);

/* ========================================================== 1. ASSERTION? */
/* Indicative forms only (-s / -ed / passive). A bare stem is an imperative
   ("validate the input") and is an instruction, not a claim. */

const CONTROL = ["gate", "validate", "sanitize", "sanitise", "check", "enforce", "verify",
  "guard", "strip", "escape", "rate-limit", "ratelimit", "throttle", "block", "reject",
  "refuse", "prevent", "screen", "filter", "restrict", "authorize", "authorise",
  "authenticate", "encrypt", "redact", "clamp", "normalize", "normalise", "allowlist",
  "denylist", "meter", "cap", "quarantine", "dedupe", "deduplicate", "revoke", "expire"];
const STATE = ["repeat", "render", "resolve", "apply", "cover", "run", "fire", "handle",
  "stamp", "derive", "propagate", "cascade", "inherit", "persist", "emit", "reach",
  "hydrate", "carry", "ship", "include", "contain", "point", "match", "mirror"];
const ALL_STEMS = CONTROL.concat(STATE).map((s) => s.replace(/-/g, "[- ]?")).join("|");

const RE_PRESENT = new RegExp(`\\b(?:${ALL_STEMS})(?:e?s|ies)\\b`, "i");
const RE_PAST = new RegExp(`\\b(?:${ALL_STEMS.replace(/y\b/g, "i")})(?:d|ed|ied)\\b`, "i");
const RE_ADJ = /\b(atomic|idempotent|owner-only|owner-gated|pro-gated|tier-gated|already (?:gated|validated|checked|sanitis?zed|escaped|handled|enforced|covered))\b/i;
const RE_EXISTS = /\bthere (?:is|are|was|were) (?:no|only|exactly)\b/i;
const RE_ABSOLUTE = /\b(every|all|each|none|never|always|cannot|guaranteed|zero|only)\b/i;
const SECURITY_DOMAIN = /\b(gate|validat|saniti[sz]|escap|authoris|authoriz|authenticat|encrypt|rate-?limit|throttl|reject|refus|block|enforc|guard|strip|meter|cap|quota|nonce|redact|allowlist|denylist|atomic|idempotent|consent|entitle|refund|charge|price|amount)/i;

/* ================================================ 2. SCOPE — is it ELSEWHERE? */

/* (a) DELEGATION — the control is said to live somewhere this file cannot show. */
const RE_DELEGATED = new RegExp(
  "\\b(upstream|downstream|elsewhere|globally|higher up|further up|somewhere else" +
  "|at the (?:boundary|edge|gate)|server-?side by|client-?side by" +
  "|(?:gated|validated|sanitis|sanitiz|checked|enforced|handled|escaped|stripped|verified|guarded|rejected|blocked|filtered|authoris|authoriz|authenticated|rate-?limited|metered|capped|covered)(?:ed)? (?:by|in|at) (?!`?(?:this|the same|code|fact|full|part|place|practice|turn|order)\\b)" +
  "|by (?:the )?(?:server|route|api|handler|framework|middleware|backend|caller|parent|platform|compiler|browser|proxy|gateway)\\b" +
  // "derived from env / process.env / here" is a local read, not a delegation
  // "derived from X" is nearly always a local field, so it is NOT a delegation.
  // "comes/sourced/loaded/pulled from X" is.
  "|(?:comes?|sourced|loaded|pulled) from (?!(?:the )?(?:env|environment|process\\.env|here|above|below|it|this)\\b)(?:the )?[`\"'@\\w/.-]+" +
  "|in the (?:layout|middleware|parent|shell|wrapper|provider|root|framework)" +
  "|already (?:gated|validated|checked|sanitis|sanitiz|escaped|handled|enforced|done|covered))\\b", "i");

/* A HARD marker means the control is explicitly said to be somewhere this file
   cannot show. Nothing local can discharge it — `const tier` is not a gate. */
const RE_HARD_ELSEWHERE = /\b(upstream|downstream|elsewhere|globally|higher up|further up|somewhere else|at the (?:boundary|edge|gate)|server-?side by|client-?side by|by (?:the )?(?:server|route|api|handler|framework|middleware|backend|caller|parent|platform|compiler|browser|proxy|gateway)\b|in the (?:layout|middleware|parent|shell|wrapper|provider|root|framework)|already (?:gated|validated|checked|sanitis|sanitiz|escaped|handled|enforced|done|covered))\b/i;

/* (b) UNIVERSAL — a quantifier ranging over artifacts this file does not own.
   Deliberately a NARROW noun list: quantifying over local data ("every block",
   "all rows") is describing an algorithm, not claiming something about the repo. */
const ARTIFACT = "pages?|routes?|layouts?|components?|files?|handlers?|endpoints?|surfaces?|screens?|views?|templates?|engines?|browsers?|migrations?|policies|placeholders?|callers?|consumers?|call ?sites?|subclasses|implementations?|middlewares?|stylesheets?|scripts?|numbers?|figures?";
const RE_UNIVERSAL = new RegExp(`\\b(?:every|all|each|no|none of the|zero|there (?:is|are) no)\\s+(?:[^\\s]+\\s+){0,2}(?:${ARTIFACT})\\b`, "i");
/* prepositional scope — "…on static pages", "repeats per page", "across routes" */
const RE_PREP_SCOPE = new RegExp(`\\b(?:on|across|per|throughout|for|in)\\s+(?:every|all|each|other|static|dynamic|the other|both)?\\s*(?:${ARTIFACT})\\b`, "i");

/* (c) PAST AUDIT — asserts a verification was performed, names no artifact. */
const RE_PAST_AUDIT = /(?:\((?=[^)]*\b(?:checked|verified|confirmed|audited|tested|measured|reviewed)\b)[^)]*\))|\b(?:checked|verified|confirmed|audited|tested|measured|reviewed|proven)\s+(?:before|earlier|already|previously|during|manually|by hand|against|at the|by the|by \w+-\w+)/i;

/* ============================================ 3. NOT A CLAIM — drop entirely */

const EXCLUDE = [
  [/\b(must|should|shall|needs? to|ought to|has to|have to|required|make sure|be sure|remember to|ensure that|so that|in order to)\b/i, "obligation"],
  [/^(never|do not|don't|avoid|prefer|use |keep |put |call |wire |add |remove |see |read |note:?\b|todo|fixme|tbd|why\b|@)/i, "instruction"],
  [/\bnever (add|write|use|call|put|introduce|import|trust|do|ship|expose|hardcode|inline|edit)\b/i, "prohibition"],
  [/\b(will|would|could|might|may)\b/i, "hypothetical"],
  [/^(if|when|unless|once|assuming|suppose|otherwise)\b/i, "conditional"],
  [/\b(previously|used to|formerly|no longer|this comment|was corrected|before this fix|as of )\b/i, "historical"],
  // honest self-limiting disclaimers are the OPPOSITE of the defect class
  [/\b(not an? \w*\s?control|does not (gate|guarantee|validate|sanitis|protect)|is not a (guarantee|gate|substitute)|no guarantee|unverified|not verified|deliberately not|is NOT )/i, "self-disclaimer"],
  // the quantifier is explicitly scoped to something the author does own
  [/\bin this (file|module|object|function|hook|component|directory|list|array|map|record|block|type)\b/i, "self-scoped"],
  // idioms that look like quantifiers
  [/\b(in any (form|case|way|event)|at all times|not at all|all the way|all of it|above all|all told)\b/i, "idiom"],
  [/(@param|@returns?|@type|@example|@see|@ts-|eslint|prettier|stylelint|Copyright|SPDX|Licensed under)/i, "boilerplate"],
  [/\?\s*$/, "question"],
];

/* ==================================================== 4. EVIDENCE — followable */

const RE_FILELINE = /[\w./[\]@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|css|scss|sql|py|go|rs|rb|php|md):\d+(?:[-–]\d+)?/;
const RE_PATH = /(?:[\w.[\]@-]+\/)*[\w.[\]@-]+\.(?:ts|tsx|js|jsx|mjs|cjs|css|scss|sql|py|go|rs|rb|php)\b/;
const RE_MODULE = /[`"'](?:@\/|\.\.?\/)[\w./[\]-]+[`"']/;
const RE_DOC_REF = /\b(?:per|see|cf\.?|ref:?)\s+[`"']?[A-Z][\w.-]*\.(?:md|mdx|txt)|\b(?:DECISIONS?|PRODUCT-PLAN|STANDARDS|COPY|AGENTS|CRAFT|PLAYBOOK|RFC|ADR|SPEC)\b[^.]{0,24}(?:§|D\d|#\d|\d+\.\d)|§\s?\d+(?:\.\d+)?/;

/* ============================================================ file plumbing */

function walk(dir, out = []) {
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIR.test(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, out); continue; }
    const ext = path.extname(e.name).toLowerCase();
    if (CODE_EXT.has(ext) || (OPT.docs && DOC_EXT.has(ext))) out.push(p);
  }
  return out;
}

function changedFiles(ref) {
  const out = execFileSync("git", ["diff", "--name-only", `${ref}...HEAD`], { cwd: root, encoding: "utf8" });
  const staged = execFileSync("git", ["diff", "--name-only", "HEAD"], { cwd: root, encoding: "utf8" });
  return [...new Set((out + "\n" + staged).split(/\r?\n/).filter(Boolean))]
    .map((f) => path.join(root, f))
    .filter((f) => { const e = path.extname(f).toLowerCase(); return (CODE_EXT.has(e) || (OPT.docs && DOC_EXT.has(e))) && fs.existsSync(f); });
}

function extractComments(src, ext) {
  if (DOC_EXT.has(ext)) {
    const blocks = []; let buf = [], start = 1, fence = false;
    src.split(/\r?\n/).forEach((ln, i) => {
      if (/^\s*```/.test(ln)) { fence = !fence; return; }
      if (fence) return;
      if (!ln.trim()) { if (buf.length) blocks.push({ text: buf.join(" "), line: start }); buf = []; return; }
      if (!buf.length) start = i + 1;
      buf.push(ln.replace(/^\s*[>*\-|#]+\s*/, ""));
    });
    if (buf.length) blocks.push({ text: buf.join(" "), line: start });
    return blocks;
  }
  const hash = /\.(py|sh|yml|yaml|rb)$/.test(ext), dash = ext === ".sql";
  const blocks = []; let i = 0, line = 1, cur = null, q = null;
  const push = () => { if (cur && cur.text.trim()) blocks.push(cur); cur = null; };
  while (i < src.length) {
    const c = src[i], c2 = src[i + 1];
    if (c === "\n") line++;
    if (q) { if (c === "\\") { i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; i++; continue; }
    if (c === "/" && c2 === "*") {
      const end = src.indexOf("*/", i + 2);
      const body = src.slice(i + 2, end === -1 ? src.length : end);
      push(); blocks.push({ text: body.replace(/^\s*\*+ ?/gm, " "), line });
      line += (body.match(/\n/g) || []).length; i = end === -1 ? src.length : end + 2; continue;
    }
    if ((c === "/" && c2 === "/" && src[i - 1] !== ":") || (hash && c === "#") || (dash && c === "-" && c2 === "-")) {
      const skip = c === "/" || dash ? 2 : 1;
      const end = src.indexOf("\n", i); const body = src.slice(i + skip, end === -1 ? src.length : end);
      if (cur && cur.endLine === line - 1) { cur.text += " " + body; cur.endLine = line; }
      else { push(); cur = { text: body, line, endLine: line }; }
      i = end === -1 ? src.length : end; continue;
    }
    if (!/\s/.test(c)) push();
    i++;
  }
  push(); return blocks;
}

/* Identifiers from CODE ONLY. Building this from the raw file would let a
   comment discharge itself: "every layout renders <main>" would find the word
   "layout" in its own sentence and conclude the claim is about local data. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function symbolTable(raw) {
  const src = stripComments(raw);
  const imported = new Set(), called = new Set(), declared = new Set(), all = new Set();
  for (const m of src.matchAll(/import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))?\s*(?:,\s*\{([^}]*)\})?\s*from/g)) {
    for (const g of [m[1], m[3]]) if (g) g.split(",").forEach((s) => { const n = s.trim().split(/\s+as\s+/).pop(); if (n) imported.add(n); });
    if (m[2]) imported.add(m[2]);
  }
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) called.add(m[1]);
  for (const m of src.matchAll(/\b(?:function|class|const|let|var|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/<([A-Z][\w.]*)/g)) called.add(m[1].split(".")[0]);
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]{2,})\b/g)) all.add(m[1].toLowerCase());
  const code = new Set([...imported, ...called, ...declared].map((x) => x.toLowerCase()));
  return { imported, called, declared, all, code };
}

/* ================================================================= analysis */

const SEV = ["low", "medium", "high", "critical"];
function baseSeverity(rel) {
  const p = rel.replace(/\\/g, "/").toLowerCase();
  if (/(__tests__|\.test\.|\.spec\.|(^|\/)docs\/|\.md$)/.test(p)) return 0;
  if (/(auth|session|identity|billing|payment|stripe|checkout|subscri|entitle|quota|tier|limit|admin|security|csp|middleware|rls|polic|migration|legal|privacy|terms|consent|webhook|\/api\/)/.test(p)) return 3;
  if (/(route\.(ts|js)|\/server\/|\/lib\/|store|supabase|schema|\/db\/)/.test(p)) return 2;
  return 1;
}

const sentences = (t) => t.replace(/\s+/g, " ")
  .split(/(?<=[.;!])\s+(?=[A-Z`*("'“])|\s+—\s+(?=[A-Z])/)
  .map((s) => s.trim())
  // drop markdown table rows in JSDoc — they shred into meaningless fragments
  .filter((s) => s.length > 20 && (s.match(/\|/g) || []).length < 3);

function analyse(s, syms, rel) {
  const words = s.split(/\s+/).length;
  if (words < 6 || words > 55) return null;

  const asserts = RE_PRESENT.test(s) || RE_PAST.test(s) || RE_ADJ.test(s) || RE_EXISTS.test(s);
  if (!asserts && !RE_ABSOLUTE.test(s)) return null;

  // UNIVERSAL outranks DELEGATED: when a claim both names a source and quantifies
  // over a set ("every number on this page comes from X"), the quantifier is the
  // part no citation discharges.
  const universal = RE_UNIVERSAL.test(s) || RE_PREP_SCOPE.test(s);
  const scope = universal ? "universal" : RE_DELEGATED.test(s) ? "delegated"
    : RE_PAST_AUDIT.test(s) ? "past-audit" : null;
  if (!scope) return null;
  if (!asserts && scope !== "universal") return null;

  for (const [re, why] of EXCLUDE) if (re.test(s)) return { skipped: why };

  // A quantifier over a noun that is also a local identifier is describing this
  // file's own data structure, not the repo.
  if (scope === "universal") {
    const noun = new RegExp(`\\b(?:every|all|each|no|zero)\\s+(?:\\w+\\s+){0,2}(${ARTIFACT})\\b`, "i").exec(s);
    const sing = noun && noun[1].toLowerCase().replace(/s$/, "");
    // Only a real declared/imported/called symbol counts — not any word that
    // happens to appear in a string literal in the file.
    if (sing && syms.code.has(sing)) return { skipped: "local-data-quantifier" };
  }

  const fileline = RE_FILELINE.exec(s);
  const pathRef = RE_PATH.exec(s) || RE_MODULE.exec(s);
  const docRef = RE_DOC_REF.exec(s);
  const resolved = [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1])
    .concat([...s.matchAll(/\b([A-Za-z_$][\w$]*(?:[A-Z][\w$]*|_[\w$]+))\b/g)].map((m) => m[1]))
    .map((t) => t.replace(/[`()<>/]|\.\w+$/g, "").trim())
    .filter((t) => t.length > 2 && (syms.imported.has(t) || syms.called.has(t) || syms.declared.has(t)));

  const evidence = fileline ? `file:line — ${fileline[0]}`
    : pathRef ? `path — ${pathRef[0]}`
    : docRef ? `doc — ${docRef[0].trim()}`
    : resolved.length ? `local symbol \`${resolved[0]}\`` : null;

  // WHAT DISCHARGES WHAT:
  //  · file:line          → discharges any scope. This is the STANDARDS bar.
  //  · a path / module / doc pointer → discharges DELEGATED and PAST-AUDIT: you
  //    named where the control lives, a reader can go there.
  //  · a local symbol     → discharges a SOFT delegation only ("derived from
  //    `amountUsd`"), never a HARD one ("rejected upstream"). A variable in this
  //    file cannot prove what another file does; `const tier` is not a gate.
  //  · nothing discharges a UNIVERSAL claim but file:line — naming one source
  //    does not prove the quantifier holds over every member of the set.
  const hard = RE_HARD_ELSEWHERE.test(s);
  const discharged = !!fileline ||
    ((!!pathRef || !!docRef) && (scope === "delegated" || scope === "past-audit")) ||
    (!!resolved.length && scope === "delegated" && !hard);

  let sev = baseSeverity(rel);
  if (SECURITY_DOMAIN.test(s)) sev++;
  if (scope === "delegated" || RE_DELEGATED.test(s)) sev++;
  return { claim: s, severity: SEV[Math.min(3, Math.max(0, sev))], evidence, discharged, scope };
}

/* ===================================================================== main */

const files = OPT.changed ? changedFiles(OPT.changed) : walk(root);
const flagged = [], local = [], skipped = {};
let scanned = 0, blocks = 0;

for (const f of files) {
  let src; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
  if (src.length > 800_000) continue;
  scanned++;
  const syms = symbolTable(src), rel = path.relative(root, f);
  for (const blk of extractComments(src, path.extname(f).toLowerCase())) {
    blocks++;
    for (const s of sentences(blk.text)) {
      const r = analyse(s, syms, rel);
      if (!r) continue;
      if (r.skipped) { skipped[r.skipped] = (skipped[r.skipped] || 0) + 1; continue; }
      (r.discharged ? local : flagged).push({ file: rel, line: blk.line, ...r });
    }
  }
}

const rank = (r) => SEV.indexOf(r.severity);

// DEDUPE. A house rule restated in eight files is ONE thing to verify, not
// eight. Without this the second run of the sweep gets ignored.
const key = (s) => s.toLowerCase().replace(/[`*_"'()[\]{}—–-]/g, "").replace(/\s+/g, " ")
  .replace(/[^a-z0-9 ]/g, "").split(" ").filter(Boolean).slice(0, 9).join(" ");
const groups = new Map();
for (const r of flagged) {
  const k = key(r.claim);
  const g = groups.get(k);
  if (!g) groups.set(k, { ...r, sites: [`${r.file}:${r.line}`] });
  else { g.sites.push(`${r.file}:${r.line}`); if (rank(r) > rank(g)) { g.severity = r.severity; g.claim = r.claim; g.file = r.file; g.line = r.line; } }
}
const rows = [...groups.values()];
rows.sort((a, b) => rank(b) - rank(a) || b.sites.length - a.sites.length || a.file.localeCompare(b.file) || a.line - b.line);
const shown = rows.filter((r) => rank(r) >= Math.max(0, SEV.indexOf(OPT.min)));

if (OPT.json) {
  console.log(JSON.stringify({ root, scanned, blocks, rows: shown, distinct: rows.length, occurrences: flagged.length, discharged: local.length, skipped }, null, 2));
} else {
  console.log(`claims-ledger-sweep · ${root}`);
  console.log(`${scanned} files · ${blocks} comment blocks · ${rows.length} distinct unsupported claims in ${flagged.length} places (${local.length} discharged by a citation)`);
  console.log(`showing severity >= ${OPT.min}\n`);
  let cur = null;
  for (const r of shown) {
    if (r.severity !== cur) { cur = r.severity; console.log(`\n════ ${cur.toUpperCase()} ════`); }
    console.log(`${r.file}:${r.line}   [${r.scope}]${r.sites.length > 1 ? `  ×${r.sites.length} restated: ${r.sites.slice(1, 4).join(", ")}${r.sites.length > 4 ? " …" : ""}` : ""}`);
    console.log(`  "${r.claim}"`);
  }
  if (OPT.all && local.length) {
    console.log(`\n════ DISCHARGED (${local.length}) — a citation exists; spot-check only ════`);
    for (const r of local) console.log(`${r.file}:${r.line}  ${r.evidence}`);
  }
  console.log(`\n${shown.length} claim(s) to read by hand. Every one is a NOMINATION, never a verdict:`);
  console.log(`the sweep cannot tell a true claim from a false one — only that nothing here lets you check.`);
}
