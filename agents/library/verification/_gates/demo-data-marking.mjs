#!/usr/bin/env node
/*
 * demo-data-marking.mjs — prove that invented demo data is MARKED as invented,
 * in the bytes a person actually receives.
 *
 * Generalised 2026-09-18 from ThamesCoast `scripts/verify/sample-marking.mjs`
 * (branch feat/map-3d-districts, 506d764..f24d4c9). See
 * ../demo-data-honesty-gate.md for the reasoning; this file is the runnable half.
 *
 * WHAT IT IS FOR. Any build that demos on mock/seed/sample data — a pitch build,
 * a pre-launch marketing site, a design prototype whose screenshots will travel,
 * a product whose real data source is not connected yet. STANDARDS.md forbids
 * fabricated content that a visitor could mistake for live content. This gate is
 * how that stops being a promise in a comment and becomes a thing that fails CI.
 *
 * WHY SERVED BYTES AND NOT SOURCE. A source scan proves the marking was authored.
 * It does not prove the marking survived rendering. The two real ways it does not:
 *   - a framework splits an interpolated string, so `Foo {mark}` serialises with a
 *     separator between the halves and no machine reader ever matches it again;
 *   - a component strips or restyles the marking on its way to the DOM.
 * Both look identical to a human and defeat every grep. So the gate fetches.
 *
 * ★ IT SHIPS WITH KNOWN-BAD FIXTURES AND RUNS THEM FIRST. If a control does not
 *   fire, it exits 2 WITHOUT reporting on the real data. A checker that cannot
 *   fail is not evidence. (Parent shape: ../control-first-check.md.)
 *
 * Usage:
 *   node demo-data-marking.mjs                     static checks only
 *   node demo-data-marking.mjs http://host:port    + served-bytes checks
 *
 * Exit: 0 = pass · 1 = a real-data check failed · 2 = a control failed, or the
 * parse did not recover every record, so THIS SCRIPT DID NOT CHECK.
 *
 * A missing base URL is reported as a SKIP and never counted as a pass.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/* ══════════════════════ ADAPT EVERYTHING IN THIS BLOCK ═══════════════════════
 * Six values. Nothing below the block is project-specific.
 * ═══════════════════════════════════════════════════════════════════════════ */

const CONFIG = {
  /** The marking, written exactly as it appears in the data and in the DOM. */
  MARK: "(sample)",

  /** Source file holding the demo records, read AS TEXT (see note below). */
  DATA_FILE: "src/lib/mock-data.ts",

  /** The exported array to slice out, and what follows it (the slice end). */
  BLOCK_START: "export const MOCK_BUSINESSES",
  BLOCK_END: "export const MOCK_AUCTION",

  /** Route to fetch for the served-bytes half. */
  ROUTE: "/map",

  /**
   * A sentence that must survive rendering as ONE contiguous string. Usually a
   * disclosure ("these figures are illustrative", "boundaries are approximate").
   * Set to null if the surface has none.
   */
  DISCLOSURE: "District shapes here are hand-drawn approximations, not official boundaries.",

  /**
   * Phrases that would present a fabricated figure as MEASURED. The page must
   * never serve any of these while it is on mock data. Add every "Live",
   * "so far", "real-time", "updated just now" phrasing your design uses.
   */
  BANNED_MEASURED_PHRASES: ["Live auction", "visitors so far.", "Live figures"],
};

/* ★ WHY THE DATA FILE IS READ AS TEXT AND NOT IMPORTED.
 *   Node cannot import a .ts module, and adding a transpiler to a verification
 *   script is how a gate acquires a dependency that later breaks it. If your
 *   demo data is .json or .mjs, import it and delete `parseRecords` below. */

/* ─────────────────────────── the checks, as pure functions ──────────────── */

/** Every record's display name carries the marking IN THE NAME ITSELF. */
function checkNames(records, MARK = CONFIG.MARK) {
  const fails = [];
  for (const r of records) {
    if (!r.name.includes(MARK)) {
      fails.push(`record ${r.id}: name ${JSON.stringify(r.name)} has no "${MARK}"`);
    }
    if (r.isSample !== true) {
      fails.push(`record ${r.id}: isSample is ${JSON.stringify(r.isSample)}, not true`);
    }
  }
  return fails;
}

/**
 * No record carries a street NUMBER. A number plus a real-sounding street is
 * what makes a person walk somewhere that does not exist. Drop this check if
 * your demo data has no addresses; keep the SHAPE for the equivalent hazard in
 * your domain (a phone number, an order id, a price a person might pay).
 */
function checkNoStreetNumbers(records) {
  const fails = [];
  for (const r of records) {
    if (/\d/.test(r.street ?? "")) {
      fails.push(`record ${r.id}: street ${JSON.stringify(r.street)} contains a digit`);
    }
  }
  return fails;
}

/**
 * The served HTML carries at least one marking per rendered record, renders
 * every record, says nothing that reads as a measured figure, and carries the
 * disclosure as one contiguous string.
 *
 * ★ THE BASE NAME AND THE MARKING ARE CHECKED SEPARATELY, ON PURPOSE.
 *   If the marking is styled (a lighter span around the suffix) then an element
 *   boundary sits between the base and the marking in the served bytes, so
 *   `html.includes("Lantern & Lark (sample)")` FAILS ON CORRECT OUTPUT. Each
 *   half is checked on its own. The entity-escaped form is checked too, because
 *   a renderer escapes `&` to `&amp;` on the way out.
 */
function checkServedHtml(html, records, cfg = CONFIG) {
  const fails = [];
  const escaped = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const markRe = new RegExp(cfg.MARK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
  const markCount = (html.match(markRe) || []).length;
  if (markCount < records.length) {
    fails.push(
      `served HTML carries ${markCount} "${cfg.MARK}" markings for ${records.length} records`,
    );
  }

  for (const r of records) {
    const base = r.name.replace(cfg.MARK, "").trim();
    if (!html.includes(base) && !html.includes(escaped(base))) {
      fails.push(`served HTML never renders ${JSON.stringify(base)}`);
    }
  }

  for (const phrase of cfg.BANNED_MEASURED_PHRASES) {
    if (html.includes(phrase)) {
      fails.push(`served HTML says ${JSON.stringify(phrase)} on a mock-data build`);
    }
  }

  if (cfg.DISCLOSURE && !html.includes(cfg.DISCLOSURE)) {
    fails.push("served HTML does not carry the disclosure as one contiguous string");
  }

  return fails;
}

/* ──────────────────────────── known-bad fixtures ────────────────────────── */
/* One control per CHECK, not one per script. A script-level smoke test proves
 * one check works and says nothing about the other five, each separately
 * capable of returning a clean-looking zero forever. */

const CONTROLS = [
  {
    name: "a record whose name lost its marking",
    run: () => checkNames([{ id: "ctl", name: "Lantern & Lark", isSample: true }]),
  },
  {
    name: "a record with isSample flipped to false",
    run: () => checkNames([{ id: "ctl", name: `Lantern & Lark ${CONFIG.MARK}`, isSample: false }]),
  },
  {
    name: "a record carrying a street NUMBER",
    run: () => checkNoStreetNumbers([{ id: "ctl", street: "12 Fictional Bank Street" }]),
  },
  {
    name: "served HTML missing a record entirely",
    run: () =>
      checkServedHtml(`${CONFIG.DISCLOSURE ?? ""} ${CONFIG.MARK}`, [
        { id: "ctl", name: `Ghost Record ${CONFIG.MARK}` },
      ]),
  },
  {
    name: "served HTML presenting a figure as measured",
    run: () =>
      checkServedHtml(
        `${CONFIG.DISCLOSURE ?? ""} Ghost Record ${CONFIG.MARK} ` +
          CONFIG.BANNED_MEASURED_PHRASES[0],
        [{ id: "ctl", name: `Ghost Record ${CONFIG.MARK}` }],
      ),
  },
  {
    name: "the disclosure broken by framework interpolation",
    run: () =>
      checkServedHtml(
        `District shapes here are <!-- -->hand-drawn approximations. X ${CONFIG.MARK}`,
        [{ id: "ctl", name: `X ${CONFIG.MARK}` }],
      ),
  },
];

/* ──────────────────────────── the record parser ─────────────────────────── */

function parseRecords(block) {
  const records = [];
  for (const m of block.matchAll(/\bid:\s*"([^"]+)"[\s\S]*?\bname:\s*"([^"]+)"/g)) {
    records.push({ id: m[1], name: m[2] });
  }
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const start = block.indexOf(`id: "${r.id}"`);
    /* ★ THE RECORD ENDS AT THE NEXT RECORD'S id, NOT AT THE FIRST `},`.
     *   Slicing to the first `},` was the original author's first version and it
     *   cut short every record containing a nested array of object literals —
     *   reporting those records as unmarked. That is a checker INVENTING a
     *   defect, which is the same class of failure as a checker missing one. */
    const next = records[i + 1] ? block.indexOf(`id: "${records[i + 1].id}"`) : block.length;
    const seg = block.slice(start, next);
    r.street = (seg.match(/street:\s*"([^"]+)"/) || [])[1] ?? "";
    r.isSample = /isSample:\s*true/.test(seg);
  }
  return records;
}

/* ──────────────────────────────── the run ───────────────────────────────── */

console.log("\n── known-bad fixtures ─────────────────────────");
let controlsOk = true;
for (const c of CONTROLS) {
  const fired = c.run().length > 0;
  if (!fired) controlsOk = false;
  console.log(`  control [${fired ? "FIRED" : "DID NOT FIRE"}] ${c.name}`);
}
if (!controlsOk) {
  console.log(
    "\nREFUSING TO REPORT: a known-bad fixture did not fire, so this checker\n" +
      "cannot be trusted about the real data. Fix the checker first.\n",
  );
  process.exit(2);
}

/* Run straight out of the library with no project around it and the six controls
 * above still fire, which is the only part that is portable. Then it stops here
 * and says so, rather than printing a stack. */
let src;
try {
  src = readFileSync(join(root, CONFIG.DATA_FILE), "utf8");
} catch {
  console.log(
    `\nCANNOT CHECK: no data file at ${CONFIG.DATA_FILE} (resolved against ${root}).\n` +
      "Controls fired, so the checker works; point CONFIG.DATA_FILE at your demo data.\n",
  );
  process.exit(2);
}
const block = src.slice(src.indexOf(CONFIG.BLOCK_START), src.indexOf(CONFIG.BLOCK_END));
const records = parseRecords(block);

/* ★ A DENOMINATOR THE SCRIPT STATES RATHER THAN ASSUMES. If the parse silently
 *   matched nothing, every check below would pass VACUOUSLY and print OK. */
const declared = (block.match(/\bid:\s*"/g) || []).length;
console.log("\n── real data ──────────────────────────────────");
console.log(`  parsed ${records.length} records against ${declared} declared`);
if (records.length === 0 || records.length !== declared) {
  console.log("\nREFUSING TO REPORT: the parse did not recover every record.\n");
  process.exit(2);
}

const fails = [...checkNames(records), ...checkNoStreetNumbers(records)];

const baseUrl = process.argv[2];
if (baseUrl) {
  const url = `${baseUrl.replace(/\/$/, "")}${CONFIG.ROUTE}`;
  try {
    const res = await fetch(url);
    const html = await res.text();
    console.log(`  fetched ${url} → ${res.status}, ${html.length} bytes`);
    if (res.status !== 200) {
      fails.push(`${url} returned ${res.status}`);
    } else {
      fails.push(...checkServedHtml(html, records));
      const markRe = new RegExp(CONFIG.MARK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      console.log(`  served bytes carry ${(html.match(markRe) || []).length} markings`);
    }
  } catch (e) {
    console.log(`  could not reach ${url}: ${e.cause?.code ?? e.message}`);
    fails.push(`served-bytes check could not run against ${url}`);
  }
} else {
  console.log("  served-bytes check SKIPPED (no base URL argument). This is a SKIP, not a pass.");
}

console.log("");
if (fails.length) {
  for (const f of fails) console.log(`  [FAIL] ${f}`);
  console.log(`\nFAIL: ${fails.length} honesty check(s) below the line.\n`);
  process.exit(1);
}
console.log(
  `  OK: ${records.length} records, every name carries "${CONFIG.MARK}", no street numbers` +
    (baseUrl ? ", served bytes marked and the disclosure intact.\n" : ".\n"),
);
