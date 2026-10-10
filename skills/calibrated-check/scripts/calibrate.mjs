#!/usr/bin/env node
/**
 * calibrate.mjs — prove a check can fail before you trust that it passed.
 *
 *   node calibrate.mjs --cmd "<shell check>" --file <path> --inject "<text>" [--at <lineNo>]
 *   node calibrate.mjs --cmd "npm run check:no-em-dash" --file src/app/page.tsx --inject "—"
 *
 * Runs the four observations that turn a pass into evidence:
 *   1. baseline        the check must be GREEN to start (else fix that first)
 *   2. injected        with the defect present it must go RED
 *   3. restored        with the defect removed it must go GREEN again
 *   4. clean tree      no calibration residue left behind
 *
 * Exit 0 only when all four hold. Anything else means the check is not
 * trustworthy yet, and the script says which observation failed.
 *
 * The file is restored from an in-memory copy in a finally block, so an
 * interrupt or a thrown error cannot leave the injection on disk.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const cmd = arg("cmd");
const file = arg("file");
const inject = arg("inject");
const at = arg("at");

if (!cmd || !file || !inject) {
  console.error("usage: calibrate.mjs --cmd <check> --file <path> --inject <text> [--at <lineNo>]");
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`FATAL: ${file} does not exist`);
  process.exit(2);
}

/** Run the check. Returns its exit code, never throws, never lets a pipe eat it. */
function run() {
  try {
    execSync(cmd, { stdio: "pipe", encoding: "utf8" });
    return 0;
  } catch (e) {
    return typeof e.status === "number" ? e.status : 1;
  }
}

const original = readFileSync(file, "utf8");
const results = {};

try {
  // 1. baseline
  results.baseline = run();
  if (results.baseline !== 0) {
    console.error(`FAIL step 1: the check is already RED (exit ${results.baseline}).`);
    console.error("Fix the real failure first. You cannot calibrate against a broken baseline.");
    process.exit(1);
  }
  console.log("  1. baseline   GREEN");

  // 2. injected
  let broken;
  if (at) {
    const lines = original.split("\n");
    const idx = Math.max(0, Math.min(lines.length - 1, Number(at) - 1));
    lines[idx] = lines[idx] + inject;
    broken = lines.join("\n");
  } else {
    // Append to the last non-empty line so the injection lands in real content
    // rather than trailing whitespace a check might ignore.
    const lines = original.split("\n");
    let idx = lines.length - 1;
    while (idx > 0 && lines[idx].trim() === "") idx--;
    lines[idx] = lines[idx] + inject;
    broken = lines.join("\n");
  }
  if (broken === original) {
    console.error("FAIL step 2: injection changed nothing. Pick a different --inject or --at.");
    process.exit(1);
  }
  writeFileSync(file, broken);
  results.injected = run();
  if (results.injected === 0) {
    console.error(`FAIL step 2: the check STILL PASSED with the defect present.`);
    console.error(`It is not checking what you think. Defect injected into ${file}:`);
    console.error(`  ${JSON.stringify(inject)}`);
    process.exit(1);
  }
  console.log(`  2. injected   RED (exit ${results.injected})  <- the check works`);
} finally {
  // Always restore, even on throw or interrupt.
  writeFileSync(file, original);
}

// 3. restored
results.restored = run();
if (results.restored !== 0) {
  console.error(`FAIL step 3: still RED (exit ${results.restored}) after restoring the file.`);
  console.error("Either the restore did not take, or the check has state. Investigate before trusting it.");
  process.exit(1);
}
console.log("  3. restored   GREEN");

// 4. clean tree
try {
  const dirty = execSync("git status --porcelain", { encoding: "utf8" })
    .split("\n")
    .filter((l) => l.trim() && l.includes(file.replace(/\\/g, "/").split("/").pop()));
  if (dirty.length) {
    console.error(`FAIL step 4: calibration residue left in the tree:\n${dirty.join("\n")}`);
    process.exit(1);
  }
  console.log("  4. tree       CLEAN");
} catch {
  console.log("  4. tree       (not a git repo, skipped)");
}

console.log(`\nCALIBRATED: "${cmd}" is green, and proven red on an injected defect in ${file}.`);
console.log("Report both observations, not just the pass.");
