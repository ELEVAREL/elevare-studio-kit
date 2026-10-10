/**
 * store-shots-checks.mjs: the pass/fail rules for a store screenshot renderer, as pure
 * functions so each can be proven against planted inputs without a browser
 * (./store-shots.selftest.mjs). Generalised from D:\elevare-app
 * scripts/design/preview/store-shots/checks.mjs (commit 6ff5617).
 *
 * The client-name list is NOT in this file. Pass the active-client patterns from the
 * project (or the studio's active-client memory) at call time: a library file that lists
 * real client names is itself the leak it guards against.
 */

/** Every shape element a glyph can draw with. */
const DRAWABLE = /<(path|circle|rect|line|polyline|polygon|ellipse)\b/g;

/**
 * Of the glyph SVGs on a page (their outerHTML, marked `data-sf="<name>"`), the ones that
 * draw NOTHING. Contract with the renderer: every visible shape sits inside ONE drawing
 * group `<g>`, and cut-outs live only inside `<defs><mask>`. A glyph is blank when that
 * group holds no shape. Counting the svg's own children can never fail, because the `<g>`
 * wrapper is always there (the round-1 bug in the source repo).
 */
export function blankGlyphs(markups) {
  const blank = [];
  for (const svg of markups) {
    const name = /data-sf="([^"]*)"/.exec(svg)?.[1] ?? '(unnamed)';
    const body = svg.replace(/<defs\b[\s\S]*?<\/defs>/g, '');
    const group = /<g\b[^>]*>([\s\S]*)<\/g>/.exec(body);
    const shapes = group ? (group[1].match(DRAWABLE) ?? []).length : 0;
    if (shapes === 0) blank.push(name);
  }
  return blank;
}

/**
 * Before any server starts: every map entry resolves to non-empty icon data, every fill and
 * cut-out index is in range, no index is both filled and cut, and no entry cuts out every
 * node. `map` is { sfName: { icon, fill?, knockout?, knockoutFill? } }; `icons` is
 * { iconName: [[tag, attrs], ...] }.
 */
export function iconMapProblems(map, icons) {
  const problems = [];
  for (const [name, entry] of Object.entries(map)) {
    const nodes = icons[entry.icon];
    if (!Array.isArray(nodes) || nodes.length === 0) {
      problems.push(`${name}: icon "${entry.icon}" has no vector data`);
      continue;
    }
    const fill = entry.fill ?? [];
    const cut = [...(entry.knockout ?? []), ...(entry.knockoutFill ?? [])];
    for (const i of [...fill, ...cut]) {
      if (!Number.isInteger(i) || i < 0 || i >= nodes.length) problems.push(`${name}: index ${i} is outside ${entry.icon}'s ${nodes.length} nodes`);
    }
    for (const i of fill) if (cut.includes(i)) problems.push(`${name}: node ${i} is both filled and cut out`);
    if (new Set(cut).size >= nodes.length) problems.push(`${name}: every node of ${entry.icon} is cut out, so it draws nothing`);
  }
  return problems;
}

/**
 * The stand-in must be IN the served bundle AND the bundler hook must have reported
 * patching the server. Either one false means the platform's own web view drew the glyphs
 * (blank boxes of the right size) and every glyph check passes on nothing.
 * `provenance` = { standInInBundle: boolean, hookLine: boolean }.
 */
export function assertStandIn(key, provenance) {
  const missing = [];
  if (provenance.standInInBundle !== true) missing.push('the stand-in module is not in the bundle');
  if (provenance.hookLine !== true) missing.push('the bundler hook never reported patching the server');
  if (missing.length > 0) throw new Error(`${key}: the stand-in is not active: ${missing.join('; ')}`);
}

/** Real client names in rendered text. `patterns` comes from the project, never from this file. */
export function forbiddenHits(text, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) throw new Error('forbiddenHits: no patterns given; an empty list passes every frame');
  return patterns.filter((re) => re.test(text)).map(String);
}

/** Why a shot fails, or [] when it passes. One list, used for the verdict and the report. */
export function shotProblems(s) {
  const p = [];
  if (!s.fontsLoaded) p.push('fonts not loaded');
  if (!s.sizeOk) p.push(`size ${s.width}x${s.height}`);
  if (s.pageErrorCount > 0) p.push(`${s.pageErrorCount} page errors`);
  if ((s.missingNeedles ?? []).length > 0) p.push(`missing ${s.missingNeedles.join(' | ')}`);
  if ((s.forbiddenHits ?? []).length > 0) p.push(`client name ${s.forbiddenHits.join(' ')}`);
  if ((s.unmapped ?? []).length > 0) p.push(`unmapped ${s.unmapped.join(' ')}`);
  if ((s.blankGlyphs ?? []).length > 0) p.push(`blank glyphs ${s.blankGlyphs.join(' ')}`);
  return p;
}

/**
 * Caption bans: each is a claim the listing must not make. Extend per product; keep the
 * dash rules. A caption also carries a `basis`: the sentence in the live store description
 * that makes it true (the renderer cannot check that; a reviewer reads it).
 */
export const CAPTION_BANS = [
  { re: /[\u2013\u2014]/, why: 'an en dash or em dash' },
  { re: /&[mn]dash;|&#821[12];|&#x201[34];/i, why: 'a dash entity' },
  { re: /\bunlimited\b|\bunlimit/i, why: '"unlimited": say the cap or say nothing' },
  { re: /[$\u00a3\u20ac]\s?\d|\b\d+(\.\d{2})?\s?(USD|GBP|EUR)\b/i, why: 'a price: the store sets it per storefront, so a caption price is wrong in all but one' },
  { re: /\bAI\b|\bAI[- ]generated\b/, why: 'an AI label on customer copy' },
];

export function captionProblems(caption, { maxWords = 6, bans = CAPTION_BANS } = {}) {
  const out = [];
  const words = caption.trim().split(/\s+/).filter(Boolean);
  if (words.length > maxWords) out.push(`${words.length} words, the limit is ${maxWords}`);
  if (words.length === 0) out.push('empty caption');
  for (const b of bans) if (b.re.test(caption)) out.push(b.why);
  return out;
}

/**
 * A frame of a screen the build under review cannot reach is a false screenshot (App Review
 * guideline 2.3.3: screenshots show the app in use). `liveFlags` is parsed from the build's
 * own flags file; a frame naming a flag that is false is HELD, not composed.
 */
export function heldReason(frame, liveFlags) {
  if (frame.omit) return `omitted: ${frame.omit}`;
  if (frame.liveFlag && !(frame.liveFlag in liveFlags)) throw new Error(`frame ${frame.n}: ${frame.liveFlag} is not declared in the flags file`);
  if (frame.liveFlag && liveFlags[frame.liveFlag] !== true) return `${frame.liveFlag} is false: the screen is hidden in this build`;
  return null;
}

/**
 * Page script that pins the clock to this week's Monday at 9:41 local, still ticking, so the
 * app's greeting and dates agree with a 9:41 status bar. Register it with
 * Page.addScriptToEvaluateOnNewDocument BEFORE navigating, then read new Date() back from the
 * page and refuse the frame unless the hour is 9 and the minute is 41 to 45.
 */
export const PINNED_CLOCK = `(() => {
  const Real = Date;
  const target = new Real();
  target.setDate(target.getDate() - ((target.getDay() + 6) % 7));
  target.setHours(9, 41, 0, 0);
  const offset = target.getTime() - Real.now();
  class ShotDate extends Real {
    constructor(...args) {
      if (args.length === 0) super(Real.now() + offset);
      else super(...args);
    }
    static now() {
      return Real.now() + offset;
    }
  }
  globalThis.Date = ShotDate;
})();`;
