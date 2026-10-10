# Hold the repo's migration folder to the LIVE migration history, offline, with a dated measurement

**Harvested 2026-09-29** from `D:\elevare-app` (Supabase project shared with a second repo), wave 5,
merged to `main` at `ef19800`. Source: `tests/contracts/migration-history.test.mjs` (commit
`87d2d8e`, "Make the privacy docs and the migration history match what is live"). Verified green at
harvest on the clean `ef19800` checkout (part of the 147 of 147 run).

## When to reach for it

- Migrations were ever applied through the Supabase MCP / dashboard / SQL editor (so the live version
  number was minted at apply time and differs from the repo filename), or applied as "a shorter copy",
  or split.
- **Two repos share one database** (an app and a studio platform, a mobile app and its web admin).
- Anyone might one day run `supabase db push` from this repo.

**The tell:** `supabase migration list` shows remote-only versions, or a repo filename timestamp that
does not appear in `supabase_migrations.schema_migrations`.

## The defect it closes

The repo carried `..._034500_seed_demo_record.sql`; live had applied the seed as `..._032557` from a
shorter copy, and one section of it separately as `..._032811`, which had no file anywhere. Live held
166 versions, the repo 5. The CLI refuses a plain `db push` twice over (remote versions missing
locally; a local file sorting before the remote's newest), and **the repair the CLI itself prints**
(`supabase migration repair --status reverted ...` then `db push --include-all`) would have
re-applied a DATA SEED to production AND rewritten the OTHER repo's history. The history was wrong
silently; the damage only needed a tired operator to follow the tool's own suggestion.

**Rule:** never run `migration repair` from a repo that shares its database, for versions it does not
own. The CLI's suggested repair is the dangerous path, not the fix.

## The recipe: a pure function over `{ name, content }`, plus a dated measurement

```js
export const LIVE_MEASURED = '2026-09-29';           // the claim has a date
export const LIVE_QUERY = `with s as (select version, name, array_to_string(statements, E'\\n') as sql
  from supabase_migrations.schema_migrations where version >= '<FLOOR>')
select version, name, md5(sql) as raw_md5,
  md5(regexp_replace(regexp_replace(regexp_replace(sql, '/\\*.*?\\*/', '', 'g'), '-{2}[^\\n]*', '', 'g'), '\\s+', '', 'g')) as code_md5
from s order by version`;
export const LIVE = [   // pasted from LIVE_QUERY, read only
  { version: '<14 digits>', name: '<label>', owner: '<this-repo | other-repo>', code: '<code_md5>', raw: '<raw_md5, only where the file IS the applied bytes>' },
];
export const PENDING = [];   // full filenames written but not yet applied

const lf = (s) => s.replace(/\r\n/g, '\n');
const codeOf = (s) => lf(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/-{2}[^\n]*/g, '').replace(/\s+/g, '');

export function historyProblems(files, live = LIVE, pending = PENDING) { /* returns string[]; empty is the only green */ }
```

`historyProblems` enforces four checks:

1. Every repo migration's version is a live version under the SAME name, unless it is in `PENDING`.
2. Its executable SQL equals what was applied, compared as `code_md5` (comments and all whitespace
   stripped, identically in Postgres and in Node). Where the repo file is the applied bytes exactly,
   the raw md5 is pinned too, so even a comment-only edit is caught there.
3. No repo migration is NEWER than the newest recorded live version unless it is in `PENDING`. A new
   migration therefore fails until someone records it as pending, and fails again after it is applied
   until the live list is re-measured. That is the point: the list is a claim with a date.
4. Every live version owned by THIS repo has a repo file (the "applied with no file" shape). Versions
   owned by the sharing repo are expected and ignored.

Plus a filename-shape check, and a floor: a file older than the measured window is reported as
"cannot be checked", never silently passed.

## Why each design choice

- **Offline, not a live read.** A test that needs a service key and network is skipped on the
  laptop that most needs it. The live list is a MEASUREMENT with `LIVE_MEASURED` next to it and the
  exact query that produced it, so re-measuring is copy, run, paste.
- **`code_md5` and not raw bytes.** The applied statement can differ from the file in comments and
  whitespace (here the seed was applied from a shorter copy). Comparing executable code catches every
  real drift without false reds on formatting.
- **A premise test that the Node and Postgres normalisers agree**, run on every file whose raw bytes
  are pinned: if `codeOf` drifted from the SQL regexes, every code comparison would compare two
  different things and could only ever pass or only ever fail.
- **The `-{2}` spelling** of the SQL line-comment pattern keeps the studio dash gate reading clean;
  it is the same regex. Re-measure the hashes with the exact text you commit.
- **LF normalise on read.** A Windows checkout with `core.autocrlf` carries CRLF; applied statements
  carry LF.

## Controls (all in the source test; each asserts the exact problem string)

The old filename is red as "not a live version" AND the live one as "has no file"; removing a file
for a live version is red; changing one value in a file's SQL is red on `code_md5`; a comment-only
change passes the code check but fails the byte check where bytes are pinned; a newer unrecorded
migration is red and turns green only once it is in `PENDING`; a label that disagrees with live is red.

## Assumes / adapt

- Supabase CLI style filenames (`<14 digits>_<snake_label>.sql`) and the
  `supabase_migrations.schema_migrations` table with a `statements text[]` column. Other migration
  tools keep a similar ledger; swap the query and the filename regex.
- Set `FLOOR` to where this repo's reconciled history begins. Everything older is out of scope and
  says so.
- The `owner` column is the whole multi-repo story. Fill it honestly; if you do not know which repo
  owns a version, that is the first finding.
- When a repo migration is renamed to match live, keep the applied bytes (`raw` pinned) where you can.
- Pairs with [`anchored-function-patch.md`](anchored-function-patch.md) (how to write a migration
  that is safe in a parallel wave) and the cross-layer replay in
  [`../verification/cross-layer-enum-contract-gate.md`](../verification/cross-layer-enum-contract-gate.md).
