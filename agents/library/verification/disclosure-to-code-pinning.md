# Pin a consent disclosure to the code: what leaves, which words the person agreed to, and every number in them

**Harvested 2026-09-29** from `D:\elevare-app` (Expo app, Supabase edge function that sends a
customer record to an LLM), wave 5, merged to `main` at `ef19800`. Two tests, each a reusable shape:

- `tests/iap/gateway-record-fields.test.mjs` (commit `9da0c64`, after the fix in `565204b` "Stop
  sending the client's email address to the model"): the FIELDS half.
- `tests/screens/consent-version.test.mjs` (commit `9da0c64`): the WORDING half.

Verified green at harvest on the clean `ef19800` checkout (part of the 147 of 147 run).

## When to reach for it

A screen, a privacy policy or an App Store privacy label says what data goes where ("your email
address and your password are never sent", "up to 40 updates", "we send your business name and
goals"), AND code somewhere builds the payload that goes there: an LLM prompt, an analytics event, a
CRM sync, a webhook to a third party. **The disclosure is a factual claim about the code**; under App
Store guideline 5.1.2(i), GDPR and CCPA it is also a legal one. Reach for this when you write the
disclosure, not after an audit finds it false.

**The incident that produced it:** the consent screen promised the email address is never sent,
while the gateway selected `clients.contact_email` into the record posted to the model. The fix was
to stop selecting the column, not to soften the sentence. These tests keep a later "the view has
nine columns, copy all nine" edit from putting it back.

## Half 1: pin what LEAVES, with two proofs because each alone has a hole

**Proof A, static, with a real parser (never a regex).** Parse the payload builder with the
TypeScript compiler API, find every `.select(...)` inside the one builder function, walk each chain
back to its `.from("<table>")`, and assert:

- the argument is ONE string literal (a computed list cannot be audited; a bare `.select()` reads
  every column);
- no column is `*`, and none matches the forbidden pattern (`/email/i`);
- the per-table column lists equal a pinned `EXPECTED_SELECTS` map EXACTLY. Every column in that map
  crosses to a third party, so adding one is a disclosure change that must be read against the
  consent copy, not merged by default.

```js
const ts = createRequire(import.meta.url)('typescript');
function selectsIn(source) {
  const sf = ts.createSourceFile('index.ts', source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const fn = findTopLevelFunction(sf, 'buildCustomerRecord');     // throws if it moved
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.name.text === 'select') {
      const table = tableOf(node);                                // walk down to .from('<t>')
      if (node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0]))
        throw new Error(`select on ${table} is not one string literal`);
      out.push({ table, columns: node.arguments[0].text.split(',').map((c) => c.trim()).filter(Boolean) });
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return out;
}
```

**Proof B, behavioural, on the real bytes.** Lift the builder function (and only the constants it
reads) out of the source with the same parser, transpile, and run it against a stub database client
whose fixture rows DO carry the forbidden data. The stub HONOURS the select list: it projects each
row to exactly the named columns, and throws on a column its fixture does not have. Then assert the
built record contains no `@` anywhere, and none of the distinctive ids you planted.

Rules for the fixture that make Proof B able to fail:

- Every non-forbidden value is `@`-free, so any `@` in the output can only be an address.
- Internal ids are DISTINCTIVE strings (`caller-auth-user-id-9d41`, not `u-1`), so a record that grew
  `who: userId` is findable as a substring. Short stub ids let exactly that pass once.
- The builder must run with NO imports (the loader throws on any `require`), so what runs is the
  function on disk, not a mock of it. (A Deno edge function cannot be loaded in Node; lifting the
  function by AST is how you still run the real bytes.)

**Calibrate both proofs in the same run:** `mutateOnce` puts the forbidden column back into one
select, and each proof must go red NAMING the column
([`mutation-control-harness.md`](mutation-control-harness.md)).

Widenings worth copying: drop any column no output uses (here `timezone` and the internal client id,
since the query FILTERS on the id and never needed it selected); hand the builder `user.id` and never
the auth user object; and require the forbidden word to appear ZERO times in the builder's source file
(comments included), so a grader's one-line grep is itself a proof.

**What it cannot prove, say it in the header:** free text inside an allowed column (a headline, a
goal the person typed) can still contain an address if a person typed one. That is content the
disclosure already names, not a column that carries it by design. And it is not a deploy check: read
the DEPLOYED function back (for Supabase, `get_edge_function`) and gate the policy on the deployed
version, never on a merge.

## Half 2: the consent version must move whenever the words move

The code that reads a stored consent throws away any answer whose `version` is not the current
`CONSENT_VERSION`. That is the ONLY thing that re-asks someone who agreed to older wording, so the
version must change every time the wording does, and nothing enforced it: reverting the version
under new wording passed every other test.

The ledger test:

1. Read each disclosure line from source as a string constant, in render order, WITHOUT evaluating
   the module (a tiny quote-aware reader for `const NAME = '...'`), join with `\n`, SHA-256 it.
2. A `LEDGER` array holds one row per published wording: `{ version, hash, note }`. Append only; a row
   may be edited only while its wording has never shipped.
3. Assert: the current hash has a row; that row's version equals `CONSENT_VERSION`; no version
   appears twice; no hash appears twice.
4. `PRINT_CONSENT_HASH=1 node --test <file>` prints the new hash for the person adding a row.

```js
function checkVersionMatchesWording(screenSrc, libSrc, ledger = LEDGER) {
  assert.equal(new Set(ledger.map((r) => r.version)).size, ledger.length, 'one version is recorded for two wordings');
  assert.equal(new Set(ledger.map((r) => r.hash)).size, ledger.length, 'one wording is recorded under two versions');
  const hash = sha256(WORDING.map((n) => stringConstant(screenSrc, n)).join('\n'));
  const row = ledger.find((r) => r.hash === hash);
  assert.ok(row, `the disclosure changed and the ledger has no row for it (hash ${hash}). Bump CONSENT_VERSION and add a row.`);
  assert.equal(consentVersion(libSrc), row.version, 'a changed disclosure carrying another version is a consent nobody gave');
}
```

Controls, each asserting the red names the right cause: revert the version under the new wording;
edit one line of each hashed card without a row; add a row that reuses an old version.

**Pin every number in the disclosure to its constant.** "Up to 40 updates" must equal
`MAX_FEED_EVENTS` in the server code: regex the number out of the copy line, regex the constant out
of the server source, assert equal, with a control that moves the constant alone. A number in consent
copy is a promise about a limit someone will later tune.

Also assert a PREMISE test that the extracted wording contains a known sentence and does NOT contain
retired phrases, so the hash is never computed over nothing.

## Assumes / adapt

- The disclosure lines are single-quoted string constants in one file. If yours come from an i18n
  catalogue, hash the catalogue entries by key instead; the ledger logic is unchanged.
- Decide explicitly which parts are hashed (here: what is sent, and what happens on a no) and which are
  not (the recipient card, headings), and write the exclusion in the header so it cannot grow quietly.
- The payload builder must be a top-level named function with literal selects. If yours builds column
  lists dynamically, refactor it first; an unauditable select is the finding.
- Pairs with [`../expo-ios-app/`](../expo-ios-app/) (the app this came from) and with the published
  policy check in [`published-legal-page-check.md`](published-legal-page-check.md): the app's copy,
  the server's payload and the live policy page are three copies of one claim, and each needs its own
  gate.
