# Zero-dep `node --test` harness that unit-tests NON-exported shipping functions

**When to reach for it:** you have a security-critical or tricky **pure function buried inside a real source file** — an SSRF `ipBlocked`, an HMAC `verifySession`, a password `hashPw`, a CSV escaper — that you want under regression tests, but you **don't want to export it just for tests** (export churn, widened surface) and you **refuse to copy-paste it into the test** (the copy silently drifts from the shipping code the moment someone edits one and not the other). This harness extracts the exact function text from the real source at test time, evals it with one injected dependency, and **fails loudly if the function is renamed/refactored** — so the test always exercises the code that actually ships, with zero test dependencies (just `node:test`).

Also covers the sibling problem: **re-loading a module under different env** when the module captures `process.env` into `const`s at require-time (so you can test multiple secret configs without child processes).

**Origin:** asky (`tests/_helpers.js` — `loadFn` + `loadStore`, used by `ssrf.test.js`, `session.test.js`, `password.test.js`). Generic to any Node codebase.

---

## `tests/_helpers.js`

```js
"use strict";
// NOT a ".test.js" file, so `node --test` won't run it directly — it's required by the real tests.
const fs = require("fs");
const path = require("path");

const STORE_PATH = require.resolve("../lib/store");
const ASK_FILE = path.join(__dirname, "..", "api", "ask.js");

// (A) Re-require a module under a chosen env value. lib/store.js reads
// process.env.SESSION_SECRET into a const AT REQUIRE TIME, so to test different
// secret configs we bust the require cache, set env, re-require, then restore env.
function loadStore({ secret } = {}) {
  delete require.cache[STORE_PATH];
  const prev = process.env.SESSION_SECRET;
  if (secret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = secret;
  const mod = require("../lib/store");
  if (prev === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = prev;      // module already captured the value; ambient env restored
  return mod;
}

// (B) Extract the source text of `function <name>(...) {...}` by brace-matching,
// so nested blocks are captured. Works when the function's string/regex literals
// contain no unbalanced braces (true for these guard functions).
function extractFunctionSource(src, name) {
  const sig = `function ${name}`;
  const start = src.indexOf(sig);
  if (start < 0) throw new Error(`extractFunctionSource: function ${name} not found`);   // renamed -> fail LOUD
  const braceStart = src.indexOf("{", start);
  if (braceStart < 0) throw new Error(`extractFunctionSource: no opening brace for ${name}`);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  if (depth !== 0) throw new Error(`extractFunctionSource: unbalanced braces for ${name}`);
  return src.slice(start, i);
}

// (C) Load a named (un-exported) function out of a source file, injecting ONE dep.
function loadFn(filePath, name, depName, dep) {
  const src = fs.readFileSync(filePath, "utf8");
  const fnSrc = extractFunctionSource(src, name);
  // eslint-disable-next-line no-new-func
  const factory = new Function(depName, `${fnSrc}\nreturn ${name};`);
  return factory(dep);                         // dep is in scope for the function body
}

module.exports = { loadStore, extractFunctionSource, loadFn, STORE_PATH, ASK_FILE };
```

## Using it — real tests, zero deps, `node --test`

```js
// tests/ssrf.test.js — test the SSRF guard without exporting it
const test = require("node:test");
const assert = require("node:assert");
const net = require("net");
const { loadFn, ASK_FILE } = require("./_helpers");

const ipBlocked = loadFn(ASK_FILE, "ipBlocked", "net", net);   // inject the one dep it references

test("blocks loopback / private / metadata / CGNAT", () => {
  for (const ip of ["127.0.0.1", "169.254.169.254", "100.64.0.1", "::1", "::ffff:127.0.0.1"])
    assert.strictEqual(ipBlocked(ip), true, `expected BLOCKED: ${ip}`);
});
```

```js
// tests/session.test.js — test HMAC session verify across secret configs
const { loadStore } = require("./_helpers");
const S = loadStore({ secret: "unit-test-secret" });
// ... assert a tampered payload -> null, a foreign-secret token -> null,
//     verify returns null when secret is "" (fail closed), 180-day expiry, etc.
```

Run: `node --test` (Node 18+ built-in runner — no jest/mocha/vitest, no config).

---

## Why this beats the alternatives

- **vs. exporting the function:** no production export exists purely for tests, so the module's public surface stays honest and nobody imports an internal helper by accident. The function stays private; the test still reaches it.
- **vs. copy-pasting the function into the test:** a copy rots. The day someone tightens `ipBlocked` and forgets the duplicated copy, the test passes against stale code and the real guard is untested. Extraction reads the **live source bytes** every run — the test literally can't drift.
- **The rename guard is the point.** If someone renames `ipBlocked` or restructures it away, `extractFunctionSource` throws `function ipBlocked not found` — a loud, immediate failure telling you the test's target moved, instead of a false green.

## Load-bearing details

1. **`_helpers.js` must not end in `.test.js`** or the runner executes it as a (empty) test file. Name shared utilities plainly.
2. **`loadFn` injects exactly one dependency by name.** It works for functions that reference at most one module (`net`, `crypto`) plus globals/pure logic. A function that pulls in several deps or closure state isn't a fit — either refactor it to be pure, or export it. Keep the harness for genuinely pure, self-contained guards.
3. **Brace-matching assumes balanced braces in string/regex literals.** A function containing a string like `"}"` unbalanced would confuse the counter. The security guards (`ipBlocked`, `verifySession`, `hashPw`, `csvSafe`) are all safe; sanity-check a candidate before trusting extraction.
4. **`loadStore` exists because the module captures env at require-time.** If your module reads `process.env` lazily (inside functions), you don't need the cache-bust dance — just set env and call. The pattern is specifically for the common "read secret into a `const` at module top" shape.
5. **`new Function` here runs your own source only** — never feed it untrusted input. It's a test-time eval of a file you already ship.

## Assumes / adapt

- **Node 18+ built-in test runner** (`node:test` + `node:assert`). No test framework, no transpile — this is the zero-dependency property; don't add jest just to run three pure-function tests.
- **Best fit: security-critical pure guards** you want pinned but not exported (auth/session, SSRF, hashing, escaping, idempotency-key formatting). For anything with real I/O, export it and test normally.
- **CommonJS** as written (`require.cache`, `module.exports`). For ESM, swap to dynamic `import()` with a cache-busting query (`import(url + "?v=" + n)`) for the `loadStore` re-load; the `loadFn` text-extraction half is module-system-agnostic (it's just reading a file and `new Function`).
- Complements, doesn't replace, the studio's live-E2E discipline (STANDARDS: build-green ≠ ship-green). This harness pins pure logic cheaply; a deployed route still needs a real HTTP smoke of its happy + error paths.
