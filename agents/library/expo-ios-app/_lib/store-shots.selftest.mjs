#!/usr/bin/env node
/**
 * Proves every rule in ./store-shots-checks.mjs and ./store-png.mjs can FAIL, with planted
 * inputs. No browser, nothing written. Exit 0 only when every case comes out as expected.
 *
 *   node D:/.claude/agents/library/expo-ios-app/_lib/store-shots.selftest.mjs
 */
import { blankGlyphs, iconMapProblems, assertStandIn, forbiddenHits, shotProblems, captionProblems, heldReason } from './store-shots-checks.mjs';
import { encodePngRgb, outputProblems } from './store-png.mjs';

const results = [];
const expect = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });
const throws = (fn) => {
  try {
    fn();
    return null;
  } catch (e) {
    return String(e.message);
  }
};

/* 1. blankGlyphs: renderer shape svg[data-sf] > (defs > mask)? + g > shapes */
const glyphs = [
  '<svg data-sf="ok.one" viewBox="0 0 24 24"><g><path d="M1 1"/></g></svg>',
  '<svg data-sf="ok.masked" viewBox="0 0 24 24"><defs><mask id="m"><rect width="24" height="24" fill="white"/><path d="M2 2"/></mask></defs><g mask="url(#m)"><rect x="1" y="1" width="4" height="4"/></g></svg>',
  '<svg data-sf="planted.empty" viewBox="0 0 24 24"><g></g></svg>',
  '<svg data-sf="planted.allcut" viewBox="0 0 24 24"><defs><mask id="n"><rect width="24" height="24" fill="white"/><path d="M1 1"/></mask></defs><g mask="url(#n)"></g></svg>',
];
const blank = blankGlyphs(glyphs);
expect('blankGlyphs reports the empty group', blank.includes('planted.empty'), blank);
expect('blankGlyphs reports the all-cut glyph (its only shapes are in the mask)', blank.includes('planted.allcut'), blank);
expect('blankGlyphs passes drawing glyphs', !blank.includes('ok.one') && !blank.includes('ok.masked') && blank.length === 2, blank);
const oldRule = glyphs.filter((svg) => !/<svg[^>]*>\s*</.test(svg)).length;
expect('CONTROL: the naive "svg has no children" rule finds none of the blanks', oldRule === 0, { oldRule });

/* 2. iconMapProblems */
const icons = { check: [['path', { d: 'M1 1' }]], house: [['path', { d: 'M1 1' }], ['path', { d: 'M2 2' }]], empty: [] };
expect('iconMapProblems passes a clean map', iconMapProblems({ a: { icon: 'check' }, b: { icon: 'house', fill: [0], knockout: [1] } }, icons).length === 0);
const bad = iconMapProblems(
  { 'p.empty': { icon: 'empty' }, 'p.missing': { icon: 'nope' }, 'p.range': { icon: 'check', fill: [3] }, 'p.allcut': { icon: 'house', knockout: [0], knockoutFill: [1] }, 'p.both': { icon: 'house', fill: [0], knockout: [0] } },
  icons,
);
for (const n of ['p.empty', 'p.missing', 'p.range', 'p.allcut', 'p.both']) expect(`iconMapProblems reports ${n}`, bad.some((p) => p.startsWith(`${n}:`)), bad);

/* 3. assertStandIn */
expect('assertStandIn passes when both flags are true', throws(() => assertStandIn('x', { standInInBundle: true, hookLine: true })) === null);
expect('assertStandIn throws when the module is not in the bundle', throws(() => assertStandIn('x', { standInInBundle: false, hookLine: true })) !== null);
expect('assertStandIn throws when the hook never reported', throws(() => assertStandIn('x', { standInInBundle: true, hookLine: false })) !== null);
expect('assertStandIn throws on a missing field', throws(() => assertStandIn('x', {})) !== null);

/* 4. forbiddenHits, with FICTIONAL planted names (real ones come from the project) */
const PATTERNS = [/acme\s*(?:&|and|\+)?\s*widgets/i, /\bzeta\s*corp\b/i];
for (const s of ['Acme & Widgets', 'Acme and Widgets', 'AcmeWidgets', 'Zeta Corp']) expect(`forbiddenHits catches "${s}"`, forbiddenHits(`Welcome to ${s}`, PATTERNS).length > 0);
expect('forbiddenHits passes the fixture business', forbiddenHits('Quillon Bakehouse', PATTERNS).length === 0);
expect('forbiddenHits refuses an empty pattern list', throws(() => forbiddenHits('anything', [])) !== null);

/* 5. shotProblems */
const good = { fontsLoaded: true, sizeOk: true, width: 1290, height: 2796, pageErrorCount: 0, missingNeedles: [], forbiddenHits: [], unmapped: [], blankGlyphs: [] };
expect('shotProblems passes a clean shot', shotProblems(good).length === 0, shotProblems(good));
for (const [k, v] of [['fontsLoaded', false], ['sizeOk', false], ['pageErrorCount', 1], ['missingNeedles', ['x']], ['forbiddenHits', ['/x/']], ['unmapped', ['x']], ['blankGlyphs', ['x']]]) {
  expect(`shotProblems fails a planted ${k}`, shotProblems({ ...good, [k]: v }).length === 1, shotProblems({ ...good, [k]: v }));
}

/* 6. captions and held frames */
expect('captionProblems passes a clean caption', captionProblems('Every move shows its source').length === 0);
expect('captionProblems refuses seven words', captionProblems('one two three four five six seven').length > 0);
expect('captionProblems refuses an em dash', captionProblems('Fast \u2014 simple').length > 0);
expect('captionProblems refuses a price', captionProblems('Only $9.99 a month').length > 0);
expect('captionProblems refuses unlimited', captionProblems('Unlimited questions').length > 0);
expect('heldReason holds a frame whose flag is false', heldReason({ n: 4, liveFlag: 'TAB_X' }, { TAB_X: false }) !== null);
expect('heldReason passes a frame whose flag is true', heldReason({ n: 4, liveFlag: 'TAB_X' }, { TAB_X: true }) === null);
expect('heldReason throws on an undeclared flag', throws(() => heldReason({ n: 4, liveFlag: 'TAB_Y' }, {})) !== null);

/* 7. PNG */
const w = 4;
const h = 3;
const rgb = Buffer.alloc(w * h * 3, 200);
const png = encodePngRgb(w, h, rgb);
expect('outputProblems passes an RGB sRGB PNG of the right size', outputProblems(png, w, h).length === 0, outputProblems(png, w, h));
expect('encodePngRgb is deterministic (byte identical rerun)', encodePngRgb(w, h, rgb).equals(png));
expect('outputProblems refuses RGBA', outputProblems(encodePngRgb(w, h, Buffer.alloc(w * h * 4, 200), { alpha: true }), w, h).some((p) => p.startsWith('alpha')));
expect('outputProblems refuses the wrong size', outputProblems(png, w + 1, h).length > 0);
expect('outputProblems refuses a PNG with no colour chunk', outputProblems(encodePngRgb(w, h, rgb, { srgb: false }), w, h).some((p) => p.includes('sRGB')));
expect('outputProblems refuses an oversize file', outputProblems(png, w, h, { maxBytes: 10 }).some((p) => p.includes('limit')));
expect('outputProblems refuses a non-PNG', outputProblems(Buffer.from('not a png at all, just text bytes here'), w, h)[0] === 'not a PNG');

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  ${JSON.stringify(r.detail)}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`store-shots.selftest: ${results.length - failed} of ${results.length} as expected`);
process.exit(failed > 0 ? 1 : 0);
