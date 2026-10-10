/**
 * mutate-once.mjs: mutation controls that PROVE they mutated, on LF and CRLF checkouts.
 *
 * Harvested 2026-09-29 from D:\elevare-app tests/harness/control.mjs (commit 640a59e, on main at
 * ef19800). Generalized: no project paths. Drop it into tests/harness/ and import it.
 *
 * The dangerous failure is not a test that cannot go red. It is a CONTROL that stays green because
 * the mutation never happened: a replace() whose literal no longer matches substitutes nothing, the
 * assertion then passes against UNMODIFIED code, and the run wears the costume of a fired control.
 *
 * Line endings: with no .gitattributes, a Windows checkout under core.autocrlf=true reads sources
 * as CRLF while hand-written markers span line breaks as bare LF. Measured in the source repo: 47
 * "CONTROL CANNOT MUTATE" throws on markers that were present. So when `from` is absent from a CRLF
 * source as written, `from` and `to` are rewritten to CRLF and matched in the file's own convention.
 * A marker cut FROM the source (already CRLF, possibly ending on a lone CR) matches as written.
 *
 * Self-test: `node mutate-once.mjs --selftest` (exit 0 pass, 1 fail). Calibrated at harvest: a copy
 * with the CRLF branch removed (made with mutateOnce itself) exits 1.
 */

import { pathToFileURL } from 'node:url';

export function mutateOnce(source, rawFrom, rawTo, label) {
  const inCrlf = !source.includes(rawFrom) && source.includes(CRLF_BREAK);
  const from = inCrlf ? toCrlf(rawFrom) : rawFrom;
  const to = inCrlf ? toCrlf(rawTo) : rawTo;
  const first = source.indexOf(from);
  if (first === -1) {
    throw new Error(
      `CONTROL CANNOT MUTATE (${label}): the marker is not in the source any more.\n` +
        `  looked for: ${JSON.stringify(from)}\n` +
        '  Fix the marker. A control that substitutes nothing reports a pass on unmodified code.',
    );
  }
  if (source.indexOf(from, first + from.length) !== -1) {
    throw new Error(
      `CONTROL IS AMBIGUOUS (${label}): the marker appears more than once, ` +
        'so it is not knowable which behaviour the control broke.',
    );
  }
  const mutated = source.slice(0, first) + to + source.slice(first + from.length);
  if (mutated === source) {
    throw new Error(`CONTROL CANNOT MUTATE (${label}): the substitution changed nothing.`);
  }
  if (mutated.includes(from)) {
    throw new Error(`CONTROL DID NOT REMOVE THE TARGET (${label}): the marker survives in the mutated text.`);
  }
  return mutated;
}

const CR = String.fromCharCode(13);
const LF_BREAK = String.fromCharCode(10);
const CRLF_BREAK = CR + LF_BREAK;
const toCrlf = (text) => String(text).split(CRLF_BREAK).join(LF_BREAK).split(LF_BREAK).join(CRLF_BREAK);

/**
 * Runs `fn` and reports whether it threw, WITH the message, so the caller can assert the red names
 * the right cause. `assert.throws` alone passes on any throw, including a TypeError from a mutation
 * that broke the file in an unrelated way: a red for the wrong reason.
 */
export function expectRed(fn) {
  try {
    fn();
  } catch (err) {
    return { red: true, message: err instanceof Error ? err.message : String(err) };
  }
  return { red: false, message: '' };
}

export async function expectRedAsync(fn) {
  try {
    await fn();
  } catch (err) {
    return { red: true, message: err instanceof Error ? err.message : String(err) };
  }
  return { red: false, message: '' };
}

/* ------------------------------------------------------------------ self-test */

function selftest() {
  const results = [];
  const run = (name, fn) => {
    let ok = false;
    let why = '';
    try {
      ok = fn() === true;
    } catch (err) {
      why = ` (threw: ${err instanceof Error ? err.message.split(LF_BREAK)[0] : String(err)})`;
    }
    results.push(ok);
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${why}`);
  };
  const lines = ['function f() {', '  let mod = null;', '  try {', '    return 1;', '  } catch {}', '}', ''];
  const LF = lines.join(LF_BREAK);
  const CRLF = lines.join(CRLF_BREAK);
  const FROM = ['  let mod = null;', '  try {'].join(LF_BREAK);
  const TO = ['  let mod = null;', '  if (true) {'].join(LF_BREAK);
  const lfOut = () => mutateOnce(LF, FROM, TO, 'lf');
  const hasBareLf = (s) => s.split(CRLF_BREAK).some((part) => part.includes(LF_BREAK));

  run('LF source, LF marker: mutates', () => lfOut().includes(TO) && !lfOut().includes(FROM));
  run('premise: the raw LF marker is NOT in the CRLF text', () => CRLF.indexOf(FROM) === -1);
  run('CRLF source, LF marker: mutates in the file own convention', () => mutateOnce(CRLF, FROM, TO, 'crlf') === toCrlf(lfOut()));
  run('CRLF result carries no bare LF', () => !hasBareLf(mutateOnce(CRLF, FROM, TO, 'crlf')));
  const cut = () => CRLF.split(LF_BREAK)[1];
  run('premise: a marker cut from CRLF text ends on a lone CR', () => cut().endsWith(CR) && cut().includes('let mod'));
  run('a cut marker matches as written', () => {
    const out = mutateOnce(CRLF, cut(), '(removed)', 'cut');
    return out.includes('(removed)') && !out.includes(cut());
  });
  run('absent marker throws CANNOT MUTATE', () => {
    const r = expectRed(() => mutateOnce(LF, 'not here', 'x', 'missing'));
    return r.red && r.message.includes('CANNOT MUTATE');
  });
  run('ambiguous marker throws AMBIGUOUS', () => {
    const r = expectRed(() => mutateOnce(['a', 'a', ''].join(LF_BREAK), 'a', 'b', 'twice'));
    return r.red && r.message.includes('AMBIGUOUS');
  });
  run('identity substitution throws', () => expectRed(() => mutateOnce(LF, 'try {', 'try {', 'noop')).red);
  run('a `to` that still contains `from` throws DID NOT REMOVE', () => {
    const r = expectRed(() => mutateOnce('x = 1;', 'x = 1;', 'x = 1; x = 1;', 'append'));
    return r.red && r.message.includes('DID NOT REMOVE');
  });
  run('expectRed reports green for a function that does not throw', () => expectRed(() => {}).red === false);

  const failed = results.filter((ok) => !ok).length;
  console.log(`${LF_BREAK}  ${results.length - failed} of ${results.length} self-test cases pass`);
  process.exit(failed === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--selftest')) {
  selftest();
}
