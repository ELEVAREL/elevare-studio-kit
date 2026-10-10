#!/usr/bin/env node
/**
 * anon-sweep.mjs — empirical anon + cross-tenant leak sweep for ANY Supabase project.
 *
 * WHY THIS EXISTS
 * The Supabase security linter does not flag `USING (true)`, and it cannot see a
 * missing REVOKE. The only honest proof that the public key reads nothing is to
 * take the public key and try. This has caught a live CRITICAL leak on an Elevare
 * project (`user_id IS NULL` in a SELECT policy = a public dump of the table).
 *
 * WHAT THIS FIXES vs. THE FIRST VERSION (both weaknesses were real)
 *   1. The old criterion was `status 200 && rows > 0`, so a wide-open policy on an
 *      EMPTY table scored `ok` — and pre-launch, most tables are empty. Here the
 *      criterion is the HTTP STATUS: any 200 for `anon` on a table not in
 *      PUBLIC_TABLES is a failure even when the body is `[]`, because a 200 means
 *      anon holds SELECT and only RLS stands between the public and every future
 *      row. Row counts are read with the SERVICE key purely to label a result
 *      INCONCLUSIVE when there was nothing there to leak.
 *   2. The old version only tested the `anon` role. It never minted a user JWT, so
 *      it could not see tenant A reading tenant B. Supply two test accounts and
 *      this signs both in and asserts that A's token returns zero rows owned by B.
 *   3. The table list was hardcoded and drifts the moment a migration lands. Here
 *      the list is DISCOVERED from PostgREST's OpenAPI root using the SERVICE key —
 *      discover privileged, probe unprivileged. (Discovering with the anon key is
 *      the classic self-defeating bug: a correctly locked-down project shows anon
 *      an empty schema, so the sweep would proudly probe nothing.)
 *
 * USAGE
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node anon-sweep.mjs
 *
 * OPTIONAL
 *   PUBLIC_TABLES=plan_limits,products     tables anon is INTENTIONALLY allowed to read
 *   OWNER_COLUMNS=user_id,owner_id,profile_id   columns that mean "whose row is this"
 *   TENANT_A_EMAIL / TENANT_A_PASSWORD
 *   TENANT_B_EMAIL / TENANT_B_PASSWORD     enable the cross-tenant probe
 *   ALLOW_EMPTY=1                          do not fail on INCONCLUSIVE (empty) tables
 *   SKIP_WRITES=1                          skip the anon INSERT probes entirely
 *
 * SAFETY
 *   Read-only except for the anon INSERT probe, which posts `{}` and is EXPECTED to
 *   be rejected. On a project where anon inserts ARE allowed it will create a row —
 *   which is exactly the finding, but run it against staging first, or SKIP_WRITES=1.
 *   Never run it with a service key you have not confirmed belongs to THIS project.
 *
 * Zero dependencies. Node 18+.
 */

const URL_BASE = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const PUBLIC_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!URL_BASE || !PUBLIC_KEY) {
  console.error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required.");
  process.exit(2);
}

const PUBLIC_TABLES = new Set(
  (process.env.PUBLIC_TABLES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
);
const OWNER_COLUMNS = (process.env.OWNER_COLUMNS ?? "user_id,owner_id,profile_id,account_id")
  .split(",").map((s) => s.trim()).filter(Boolean);
const ALLOW_EMPTY = process.env.ALLOW_EMPTY === "1";
const SKIP_WRITES = process.env.SKIP_WRITES === "1";

const anonHeaders = { apikey: PUBLIC_KEY, Authorization: `Bearer ${PUBLIC_KEY}` };
const serviceHeaders = SERVICE_KEY
  ? { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  : null;

/** findings[] — anything here is a failure. warnings[] — needs a human look. */
const findings = [];
const warnings = [];
const inconclusive = [];

const pad = (s, n) => String(s).padEnd(n);
function line(verdict, status, label, note = "") {
  console.log(`${pad(verdict, 16)}${pad(status, 5)}${pad(label, 46)}${note}`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. DISCOVERY — privileged, never from the anon key
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * PostgREST's OpenAPI root lists every table/view and every RPC the CALLING ROLE
 * can see. Called with the service key that is the whole exposed schema.
 *
 * Fallback when no service key is supplied: the anon root. This is explicitly
 * WEAKER and is reported as such — on a properly locked project it returns almost
 * nothing, so the sweep would appear to pass by probing an empty list.
 */
async function discover() {
  const headers = serviceHeaders ?? anonHeaders;
  const res = await fetch(`${URL_BASE}/rest/v1/`, { headers: { ...headers, Accept: "application/openapi+json" } });
  if (!res.ok) throw new Error(`Schema discovery failed: HTTP ${res.status}`);
  const doc = await res.json();

  const tables = Object.keys(doc.definitions ?? {}).sort();
  const rpcs = Object.keys(doc.paths ?? {})
    .filter((p) => p.startsWith("/rpc/"))
    .map((p) => p.slice("/rpc/".length))
    .sort();

  if (!serviceHeaders) {
    warnings.push(
      "No SUPABASE_SERVICE_ROLE_KEY: the table list was discovered with the PUBLIC key. " +
        "A locked-down project shows anon an empty schema, so this run proves far less than it looks like it does.",
    );
  }
  return { tables, rpcs };
}

/** Exact row count via the service key. `null` when unknown. */
async function privilegedCount(table) {
  if (!serviceHeaders) return null;
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&limit=1`, {
    headers: { ...serviceHeaders, Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range");           // e.g. "0-0/42"
  const total = range?.split("/")[1];
  return total && total !== "*" ? Number(total) : null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. THE ANON READ SWEEP — the criterion is the STATUS, not the row count
 * ──────────────────────────────────────────────────────────────────────────── */

async function sweepReads(tables) {
  console.log("\n--- SELECT on every exposed table, as anon (200 = FAIL, even if []) ---");
  for (const table of tables) {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&limit=5`, { headers: anonHeaders });
    const count = await privilegedCount(table);
    const rows = res.status === 200 ? (await res.json().catch(() => [])).length : "-";
    const intentional = PUBLIC_TABLES.has(table);

    if (res.status === 200 && !intentional) {
      findings.push(`READ ${table}: anon holds SELECT (HTTP 200, ${rows} rows returned, table holds ${count ?? "?"})`);
      line("*** LEAK ***", res.status, table, `rows=${rows} total=${count ?? "?"}`);
    } else if (res.status === 200) {
      line("public (ok)", res.status, table, `rows=${rows} — declared in PUBLIC_TABLES`);
    } else {
      line("ok", res.status, table, count === 0 ? "table is EMPTY" : `total=${count ?? "?"}`);
    }

    // An empty table can hide a policy that has simply never had a row to leak.
    // A 401 on an empty table is still a real 401 (the grant is the gate), so this
    // is only INCONCLUSIVE for the *policy* layer behind the grant.
    if (count === 0) inconclusive.push(table);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. KNOWN-DANGEROUS SHAPES — generated per table, not hardcoded
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `USING (user_id = auth.uid() OR user_id IS NULL)` is the exact policy that leaked
 * every guest session on a prior Elevare project. It reads as "mine, plus orphans";
 * to anon, `auth.uid()` is NULL and the second clause matches every unowned row.
 */
async function sweepDangerousShapes(tables) {
  console.log("\n--- known-dangerous query shapes, as anon ---");
  for (const table of tables) {
    if (PUBLIC_TABLES.has(table)) continue;
    for (const column of OWNER_COLUMNS) {
      const path = `${table}?${column}=is.null&select=*&limit=5`;
      const res = await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: anonHeaders });
      if (res.status === 200) {
        const rows = (await res.json().catch(() => [])).length;
        findings.push(`SHAPE ${path}: HTTP 200 (${rows} rows) — the "IS NULL" public-dump shape`);
        line("*** LEAK ***", res.status, `${table}?${column}=is.null`, `rows=${rows}`);
      }
      // 400 "column does not exist" is the normal case — the table has no such column.
    }
  }
  console.log("(silent = every shape refused)");
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. ANON WRITES — 400 matters as much as 200
 * ──────────────────────────────────────────────────────────────────────────── */

async function sweepWrites(tables) {
  if (SKIP_WRITES) { console.log("\n--- anon WRITE attempts: SKIPPED (SKIP_WRITES=1) ---"); return; }
  console.log("\n--- anon INSERT attempts (401/403 = ok; 400 = anon reached VALIDATION, so it holds INSERT) ---");
  for (const table of tables) {
    const res = await fetch(`${URL_BASE}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...anonHeaders, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: "{}",
    });
    if (res.status === 200 || res.status === 201) {
      findings.push(`WRITE ${table}: anon INSERT SUCCEEDED (HTTP ${res.status}) — a row was created`);
      line("*** WROTE ***", res.status, `INSERT ${table}`);
    } else if (res.status === 400 || res.status === 409 || res.status === 422) {
      // Rejected by NOT NULL / a CHECK / a FK — i.e. it got PAST the privilege and
      // RLS check. A well-formed body would have landed.
      warnings.push(`WRITE ${table}: HTTP ${res.status} — anon reached validation, so INSERT is granted`);
      line("!! GRANTED !!", res.status, `INSERT ${table}`, "reached validation, not authz");
    } else {
      line("ok", res.status, `INSERT ${table}`);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. RPCs — discovered, then probed as anon
 * ──────────────────────────────────────────────────────────────────────────── */

async function sweepRpcs(rpcs) {
  console.log("\n--- RPCs, as anon (404/401/403 = ok; 200 or 400 = EXECUTE is granted) ---");
  for (const fn of rpcs) {
    const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { ...anonHeaders, "Content-Type": "application/json" },
      body: "{}",
    });
    if (res.status === 200) {
      findings.push(`RPC ${fn}: callable by anon (HTTP 200)`);
      line("*** CALLABLE ***", res.status, `rpc/${fn}`);
    } else if (res.status === 400 || res.status === 404) {
      // 404 from PostgREST usually means "no function with these args" — which for a
      // no-arg probe can ALSO mean "not exposed to this role". Treat as a warning so
      // a human confirms with `\df+` rather than trusting an ambiguous status.
      const body = await res.text();
      const argMismatch = /does not exist|could not find/i.test(body);
      if (argMismatch) line("ok?", res.status, `rpc/${fn}`, "arg mismatch — confirm EXECUTE grant by hand");
      else { warnings.push(`RPC ${fn}: HTTP ${res.status} — reached the function body`); line("!! GRANTED !!", res.status, `rpc/${fn}`); }
    } else {
      line("ok", res.status, `rpc/${fn}`);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. CROSS-TENANT — the probe the anon-only sweep can never do
 * ──────────────────────────────────────────────────────────────────────────── */

async function signIn(email, password) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLIC_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: HTTP ${res.status} ${await res.text()}`);
  const { access_token, user } = await res.json();
  return { token: access_token, id: user.id };
}

/**
 * Sign in two real users and assert that A's JWT returns NO row owned by B.
 *
 * This is the class an anon-only sweep is structurally blind to: `USING (true)`
 * on a table whose grants are `authenticated`-only refuses anon perfectly and
 * hands every tenant every other tenant's rows.
 */
async function sweepCrossTenant(tables) {
  const a = { email: process.env.TENANT_A_EMAIL, password: process.env.TENANT_A_PASSWORD };
  const b = { email: process.env.TENANT_B_EMAIL, password: process.env.TENANT_B_PASSWORD };
  if (!a.email || !b.email) {
    warnings.push(
      "CROSS-TENANT PROBE SKIPPED — no TENANT_A_*/TENANT_B_* credentials. " +
        "This sweep therefore proves nothing about one signed-in user reading another's rows.",
    );
    console.log("\n--- cross-tenant: SKIPPED (no test accounts supplied) ---");
    return;
  }

  const userA = await signIn(a.email, a.password);
  const userB = await signIn(b.email, b.password);
  const headersA = { apikey: PUBLIC_KEY, Authorization: `Bearer ${userA.token}` };

  console.log(`\n--- cross-tenant: A=${userA.id} reading B=${userB.id}'s rows ---`);
  for (const table of tables) {
    if (PUBLIC_TABLES.has(table)) continue;
    const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*&limit=200`, { headers: headersA });
    if (res.status !== 200) { line("ok", res.status, table, "not readable by A at all"); continue; }

    const rows = await res.json().catch(() => []);
    const foreign = rows.filter((row) =>
      OWNER_COLUMNS.some((col) => row[col] !== undefined && row[col] !== null && row[col] !== userA.id),
    );
    if (foreign.length > 0) {
      const owners = [...new Set(foreign.flatMap((r) => OWNER_COLUMNS.map((c) => r[c]).filter(Boolean)))];
      findings.push(`CROSS-TENANT ${table}: A read ${foreign.length} row(s) owned by ${owners.join(", ")}`);
      line("*** LEAK ***", 200, table, `${foreign.length} foreign rows`);
    } else if (rows.length === 0) {
      // Seed B's data before trusting this. A table A legitimately reads but that
      // holds no B rows yet is not evidence of isolation.
      line("ok?", 200, table, "0 rows — seed tenant B and re-run");
      inconclusive.push(`${table} (cross-tenant)`);
    } else {
      line("ok", 200, table, `${rows.length} rows, all A's`);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Run
 * ──────────────────────────────────────────────────────────────────────────── */

const { tables, rpcs } = await discover();
console.log(`Discovered ${tables.length} tables/views and ${rpcs.length} RPCs at ${URL_BASE}`);
if (PUBLIC_TABLES.size) console.log(`Intentionally public: ${[...PUBLIC_TABLES].join(", ")}`);

await sweepReads(tables);
await sweepDangerousShapes(tables);
await sweepWrites(tables);
await sweepRpcs(rpcs);
await sweepCrossTenant(tables);

console.log("\n========================================");
if (findings.length === 0) console.log(`PASS — 0 leaks across ${tables.length} tables and ${rpcs.length} RPCs`);
else { console.log(`FAIL — ${findings.length} finding(s):`); for (const f of findings) console.log(`  * ${f}`); }

if (warnings.length) { console.log(`\n${warnings.length} warning(s) — a human must read these:`); for (const w of warnings) console.log(`  ! ${w}`); }

if (inconclusive.length) {
  console.log(`\n${inconclusive.length} INCONCLUSIVE (empty at probe time — seed a row and re-run):`);
  console.log(`  ${[...new Set(inconclusive)].join(", ")}`);
  console.log("  An empty table cannot leak. It also cannot PROVE it will not.");
}
console.log("========================================");

const failed = findings.length > 0 || warnings.length > 0 || (!ALLOW_EMPTY && inconclusive.length > 0);
process.exitCode = failed ? 1 : 0;
