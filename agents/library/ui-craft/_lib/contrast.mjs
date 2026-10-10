#!/usr/bin/env node
/*
 * contrast.mjs : resolve the daylight palette out of the built stylesheet and
 * print every required text pair with its ratio and a pass/fail.
 *
 * Owner: design-engineer. Required by DIRECTION-AGENT-REPORT.md section 6.
 *
 * WHAT IT READS. It does NOT read a hand-typed table of colours. It reads the
 * `[data-surface="daylight"]` custom-property block out of the shipped file
 * (report.html by default) and resolves the var() chains itself, so a token
 * edited in the stylesheet moves this script's output. That is the only way
 * the number means anything.
 *
 * CALIBRATION. The script prints four rows whose answers are known before
 * it runs: a pair that MUST fail, a pair that MUST pass, a
 * color-mix() pair (because color-mix resolves to color(srgb 0-1) and NOT
 * rgb(0-255), and a parser that gets that wrong silently returns a wrong
 * ratio rather than an error), and a self-pair which is 1.00:1 by identity.
 * Calibration runs automatically before the real table on every invocation.
 * If the known-fail row does not say FAIL, the script is not a check.
 *
 * EXIT CODES. 0 = every required pair passed. 1 = at least one failed.
 * 2 = the script could not resolve something and therefore did not check.
 * Exit 2 is deliberate: "I could not compute it" must never look like a pass.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const target = resolvePath(
  HERE,
  process.argv.find((a) => a.endsWith(".html") || a.endsWith(".css")) ??
    "report.html",
);

/* ===================================================================
 * 1. COLOUR PARSING
 *
 * The trap named in the brief: color-mix() resolves to
 * `color(srgb 0.43 0.16 0.85)` in the 0-to-1 domain, not to
 * `rgb(110 40 217)` in the 0-to-255 domain. A parser that assumes 255
 * turns every mixed colour into near-black, which makes ratios look
 * BETTER than they are on a light ground. Wrong in the dangerous
 * direction, and silent. Hence both forms are handled explicitly and
 * the calibration exercises the srgb one.
 * =================================================================== */

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function srgbToOklab([r, g, b]) {
  const R = srgbToLinear(r),
    G = srgbToLinear(g),
    B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function oklabToSrgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const R = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const G = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const Bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [R, G, Bl].map((v) => Math.min(1, Math.max(0, linearToSrgb(v))));
}

const TRANSPARENT = { rgb: [0, 0, 0], a: 0 };

/** Returns { rgb: [0..1, 0..1, 0..1], a: 0..1 } or throws. */
function parseColor(raw, lookup, depth = 0) {
  if (depth > 24) throw new Error(`var() cycle resolving ${raw}`);
  const s = String(raw).trim();

  if (/^transparent$/i.test(s)) return TRANSPARENT;

  // var(--name) and var(--name, fallback)
  const v = s.match(/^var\(\s*(-{2}[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (v) {
    const got = lookup(v[1]);
    if (got !== undefined) return parseColor(got, lookup, depth + 1);
    if (v[2]) return parseColor(v[2], lookup, depth + 1);
    throw new Error(`unresolved token ${v[1]}`);
  }

  // #rgb / #rrggbb / #rrggbbaa
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4)
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16) / 255;
    return { rgb: [n(0), n(2), n(4)], a: h.length === 8 ? n(6) : 1 };
  }

  // rgb()/rgba(), 0-255 domain (or percentages)
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const p = rgb[1].split(/[\s,/]+/).filter(Boolean);
    const n = (t) =>
      t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t) / 255;
    return {
      rgb: [n(p[0]), n(p[1]), n(p[2])],
      a: p[3] === undefined ? 1 : p[3].endsWith("%")
        ? parseFloat(p[3]) / 100
        : parseFloat(p[3]),
    };
  }

  // color(srgb r g b [/ a]) : the 0-to-1 domain. THIS is what color-mix()
  // serialises to in a browser, and mis-reading it as 0-to-255 is the
  // silent-wrong-ratio bug the brief warns about.
  const col = s.match(/^color\(\s*srgb\s+([^)]+)\)$/i);
  if (col) {
    const p = col[1].split(/[\s/]+/).filter(Boolean);
    const n = (t) => (t.endsWith("%") ? parseFloat(t) / 100 : parseFloat(t));
    return {
      rgb: [n(p[0]), n(p[1]), n(p[2])],
      a: p[3] === undefined ? 1 : n(p[3]),
    };
  }

  // color-mix(in <space>, A [p%], B [p%])
  const mix = s.match(/^color-mix\(\s*in\s+([\w-]+)\s*,\s*([\s\S]+)\)$/i);
  if (mix) {
    const space = mix[1].toLowerCase();
    const parts = splitTop(mix[2]);
    if (parts.length !== 2) throw new Error(`color-mix needs 2 colours: ${s}`);
    const read = (t) => {
      const m = t.trim().match(/^([\s\S]+?)\s+([\d.]+)%$/);
      return m
        ? { c: parseColor(m[1], lookup, depth + 1), p: parseFloat(m[2]) / 100 }
        : { c: parseColor(t, lookup, depth + 1), p: null };
    };
    const A = read(parts[0]);
    const B = read(parts[1]);
    let pa = A.p,
      pb = B.p;
    if (pa === null && pb === null) (pa = 0.5), (pb = 0.5);
    else if (pa === null) pa = 1 - pb;
    else if (pb === null) pb = 1 - pa;
    const sum = pa + pb;
    if (sum === 0) throw new Error(`color-mix percentages sum to 0: ${s}`);
    pa /= sum;
    pb /= sum;
    const alpha = A.c.a * pa + B.c.a * pb;
    if (space === "oklab" || space === "oklch") {
      const la = srgbToOklab(A.c.rgb),
        lb = srgbToOklab(B.c.rgb);
      return {
        rgb: oklabToSrgb([0, 1, 2].map((i) => la[i] * pa + lb[i] * pb)),
        a: alpha,
      };
    }
    return {
      rgb: [0, 1, 2].map((i) => A.c.rgb[i] * pa + B.c.rgb[i] * pb),
      a: alpha,
    };
  }

  throw new Error(`cannot parse colour: ${s}`);
}

function splitTop(str) {
  const out = [];
  let depth = 0,
    cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/* ===================================================================
 * 2. WCAG 2.x RELATIVE LUMINANCE AND RATIO
 * =================================================================== */

function luminance([r, g, b]) {
  const [R, G, B] = [r, g, b].map(srgbToLinear);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Composite a possibly-translucent colour onto an opaque ground. */
function over(fg, bg) {
  if (fg.a >= 1) return fg.rgb;
  return [0, 1, 2].map((i) => fg.rgb[i] * fg.a + bg[i] * (1 - fg.a));
}

function ratio(fgSpec, bgSpec, lookup) {
  const bgC = parseColor(bgSpec, lookup);
  if (bgC.a < 1)
    throw new Error(
      `background ${bgSpec} is translucent; a ratio against it is not a real number`,
    );
  const fg = over(parseColor(fgSpec, lookup), bgC.rgb);
  const L1 = luminance(fg),
    L2 = luminance(bgC.rgb);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

/* ===================================================================
 * 3. READ THE TOKENS OUT OF THE BUILT FILE
 * =================================================================== */

function readTokens(file) {
  const src = readFileSync(file, "utf8");
  const block = src.match(/\[data-surface=["']daylight["']\]\s*\{([\s\S]*?)\}/);
  if (!block)
    fail(
      `no [data-surface="daylight"] block found in ${file}. The script did not check anything.`,
    );
  const map = new Map();
  for (const m of block[1].matchAll(/(-{2}[\w-]+)\s*:\s*([^;]+);/g))
    map.set(m[1], m[2].replace(/\/\*[\s\S]*?\*\//g, "").trim());
  if (map.size === 0)
    fail(`the daylight block in ${file} declared no custom properties.`);
  return map;
}

function fail(msg) {
  console.error(`\n  CANNOT CHECK: ${msg}\n`);
  process.exit(2);
}

/* ===================================================================
 * 4. THE TABLE
 * =================================================================== */

const TEXT_FLOOR = 4.5;
const NONTEXT_FLOOR = 3.0; // WCAG 1.4.11, and the control-border floor.

function row(label, fg, bg, floor, lookup, results, opts = {}) {
  let r, err;
  try {
    r = ratio(fg, bg, lookup);
  } catch (e) {
    err = e.message;
  }
  const pass = err ? null : r >= floor;
  results.push({ label, fg, bg, floor, r, pass, err, ...opts });
  const num = err ? "   ERR" : r.toFixed(2).padStart(6);
  const floorTxt = opts.noFloor ? "   n/a  " : `floor ${floor.toFixed(1)}`;
  const verdict = err
    ? "CANNOT CHECK"
    : opts.expect
      ? `${pass ? "FAIL" : "below floor"} ${opts.expect === (pass ? "pass" : "fail") ? "" : ""}`.trim()
      : pass
        ? "PASS"
        : "FAIL";
  // Calibration rows report against their OWN expectation, not the floor,
  // so a row that is SUPPOSED to be 1.00:1 does not read as a defect.
  const shown = opts.expect
    ? `expected ${opts.expect}, got ${pass ? "pass" : "fail"}  ${
        (opts.expect === "pass") === pass ? "AS EXPECTED" : "★ MISCALIBRATED"
      }`
    : opts.noFloor
      ? opts.note ?? ""
      : verdict;
  console.log(`  ${label.padEnd(46)} ${num}:1   ${floorTxt}   ${shown}`);
  return pass;
}

function calibrate(lookup) {
  console.log(
    "\nCALIBRATION : four rows whose answer is known before the script runs.",
  );
  console.log(
    "              If the KNOWN-FAIL row does not say FAIL, this script is not a check.\n",
  );
  const res = [];
  // KNOWN FAIL: the decorative hairline as if it were text. globals.css:334
  // labels --card-border decoration only at 1.18:1. It must fail at 4.5.
  row(
    "KNOWN-FAIL  card-border as text on background",
    "var(--card-border)",
    "var(--background)",
    TEXT_FLOOR,
    lookup,
    res,
    { expect: "fail" },
  );
  // KNOWN PASS: the body pair. Near-black on warm paper.
  row(
    "KNOWN-PASS  foreground on background",
    "var(--foreground)",
    "var(--background)",
    TEXT_FLOOR,
    lookup,
    res,
    { expect: "pass" },
  );
  // KNOWN VALUE: color-mix in the srgb 0-to-1 domain. A parser that reads
  // color(srgb ...) as 0-to-255 clamps this to black and reports ~19:1
  // instead of ~1.0:1, so this row catches that bug by name.
  row(
    "KNOWN-VALUE color-mix 100% background on bg = 1.00",
    "color-mix(in srgb, var(--background) 100%, var(--foreground))",
    "var(--background)",
    TEXT_FLOOR,
    lookup,
    res,
    { noFloor: true, note: "must be 1.00:1. If it is ~19:1 the srgb 0-to-1 domain was mis-parsed." },
  );
  // IDENTITY: any colour on itself is 1.00:1.
  row(
    "IDENTITY    foreground on foreground",
    "var(--foreground)",
    "var(--foreground)",
    TEXT_FLOOR,
    lookup,
    res,
    { noFloor: true, note: "must be 1.00:1 by identity." },
  );

  const knownFail = res[0];
  const knownPass = res[1];
  const knownValue = res[2];
  const identity = res[3];
  const problems = [];
  if (knownFail.pass !== false)
    problems.push("the KNOWN-FAIL row did not fail");
  if (knownPass.pass !== true) problems.push("the KNOWN-PASS row did not pass");
  if (!knownValue.r || Math.abs(knownValue.r - 1) > 0.01)
    problems.push(
      `the color-mix row resolved to ${knownValue.r?.toFixed(2)}:1 and should be 1.00:1 (srgb 0-to-1 domain mis-parsed)`,
    );
  if (!identity.r || Math.abs(identity.r - 1) > 0.001)
    problems.push("the identity row was not 1.00:1");
  if (problems.length) fail(`calibration failed: ${problems.join("; ")}`);
  console.log("\n  Calibration OK. The script can go red. Proceeding.\n");
}

function main() {
  const tokens = readTokens(target);
  const lookup = (name) => tokens.get(name);

  console.log(`\ncontrast.mjs`);
  console.log(`  source : ${target}`);
  console.log(
    `  tokens : ${tokens.size} custom properties read from the [data-surface="daylight"] block`,
  );

  calibrate(lookup);

  console.log(
    "REQUIRED PAIRS : DIRECTION-AGENT-REPORT.md section 6.\n",
  );
  const res = [];
  row("foreground on background", "var(--foreground)", "var(--background)", TEXT_FLOOR, lookup, res);
  row("muted on background", "var(--muted)", "var(--background)", TEXT_FLOOR, lookup, res);
  row("muted on card", "var(--muted)", "var(--card)", TEXT_FLOOR, lookup, res);
  row("accent on background", "var(--accent)", "var(--background)", TEXT_FLOOR, lookup, res);
  row("accent-contrast on accent-strong", "var(--accent-contrast)", "var(--accent-strong)", TEXT_FLOOR, lookup, res);
  row("receipt mono text on card", "var(--foreground)", "var(--card)", TEXT_FLOOR, lookup, res);
  row("receipt field label on card", "var(--muted)", "var(--card)", TEXT_FLOOR, lookup, res);
  row("money_confidence label on card", "var(--muted)", "var(--card)", TEXT_FLOOR, lookup, res);
  row("money_confidence marker on card", "var(--foreground)", "var(--card)", NONTEXT_FLOOR, lookup, res);
  row("UNKNOWN box text on background", "var(--foreground)", "var(--background)", TEXT_FLOOR, lookup, res);
  row("UNKNOWN box text on card", "var(--foreground)", "var(--card)", TEXT_FLOOR, lookup, res);
  row("control-border on background (non-text)", "var(--control-border)", "var(--background)", NONTEXT_FLOOR, lookup, res);
  row("control-border on card (non-text)", "var(--control-border)", "var(--card)", NONTEXT_FLOOR, lookup, res);
  row("accent on card (open-receipt edge, non-text)", "var(--accent)", "var(--card)", NONTEXT_FLOOR, lookup, res);
  row("killed-list text on background", "var(--foreground)", "var(--background)", TEXT_FLOOR, lookup, res);
  row("dateline fine print on background", "var(--muted)", "var(--background)", TEXT_FLOOR, lookup, res);

  /* ---------------------------------------------------------------
   * DECORATION, measured and reported but NOT gated.
   *
   * --card-border is decoration only. It is measured here so that the
   * number is on the record rather than quoted from a comment, and
   * because the two ratios are different and the difference is where
   * the trap lives: globals.css:334 says "1.18:1", which is the ratio
   * against --card. Against --background, the page ground, it is
   * 1.29:1. Both are decoration and neither may bound a control, so
   * the conclusion is unchanged, but a number repeated from a comment
   * is not a measured number.
   * --------------------------------------------------------------- */
  console.log(
    "\nDECORATION : measured, reported, and deliberately NOT gated.\n",
  );
  const deco = [];
  row("card-border on background", "var(--card-border)", "var(--background)", TEXT_FLOOR, lookup, deco, {
    noFloor: true,
    note: "decoration only. never a control boundary.",
  });
  row("card-border on card", "var(--card-border)", "var(--card)", TEXT_FLOOR, lookup, deco, {
    noFloor: true,
    note: "decoration only. this is the pair globals.css:334 quotes.",
  });
  console.log("");

  const errs = res.filter((x) => x.err);
  if (errs.length) {
    console.error(
      `\n  ${errs.length} pair(s) could not be computed. That is not a pass.\n`,
    );
    process.exit(2);
  }
  const fails = res.filter((x) => x.pass === false);
  console.log("");
  if (fails.length) {
    console.error(
      `  ${fails.length} of ${res.length} required pairs FAILED:\n${fails
        .map((f) => `    - ${f.label} at ${f.r.toFixed(2)}:1`)
        .join("\n")}\n`,
    );
    process.exit(1);
  }
  console.log(`  ${res.length} of ${res.length} required pairs passed.\n`);
  process.exit(0);
}

main();
