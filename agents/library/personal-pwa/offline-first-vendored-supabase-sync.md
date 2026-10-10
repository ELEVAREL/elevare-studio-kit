# Offline-first vendored supabase-js + IndexedDB last-write-wins sync

**When to reach for it:** a **no-build static app** (plain HTML/CSS/JS, no bundler, no
framework) that must **work fully offline** and **sync to Supabase when back online** —
a phone-installed PWA, a field/kiosk tool, a personal companion app. IndexedDB is the
working store the app always reads; the cloud is an **additive backup/merge** layer,
never a gate. This is the offline-first spine the single-user and hybrid-AI patterns in
this domain sit on. Distinct from `serverless-thin-client/` (keeps the browser off the
DB entirely, service-role is the boundary) and `offline-native-app/` (zero cloud, File
System Access) — here the browser holds a real supabase-js client with RLS + a local
IndexedDB mirror.

Three load-bearing pieces:

1. **Vendor supabase-js** (no CDN, no build) and **dynamic-import** it lazily so the app
   paints and runs offline before the library resolves.
2. **A local IndexedDB store with an outbox** — every domain write also enqueues a sync
   op in the *same* helper, so a caller can never forget to queue a change.
3. **A sync layer** — `pull` (cloud→local, LWW merge) + `flush` (outbox→cloud), each a
   graceful no-op when signed-out / offline / paused.

---

## 1. Vendored, lazily-imported singleton client

Static-import at module top would force a large library to resolve before first paint
and break a cold/offline boot. Instead: commit the fully-bundled ESM build (zero external
module refs, so the SW can cache it) and dynamic-`import()` it on first use. **Exactly one
client, ever** — multiple `createClient()` instances race token refresh and produce random
401s.

```js
// supabase.js — the ONE client for the whole app.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
const VENDOR_URL = '../vendor/supabase-js.esm.js';   // committed, offline-cacheable
const AUTH_STORAGE_KEY = 'app.auth';                 // namespaced; never collides with UI-state keys

let _client = null, _clientPromise = null;

// Placeholders look like "__SUPABASE_URL__"; treat those (and empties) as "not
// configured" so an un-injected/local build runs offline-only cleanly.
export function isConfigured() {
  const url = String(SUPABASE_URL || ''), key = String(SUPABASE_ANON_KEY || '');
  if (!url || !key || url.startsWith('__') || key.startsWith('__')) return false;
  return /^https?:\/\//i.test(url);
}

// Never throws. On ANY failure (offline first-load, missing config, bad vendor
// module) resolves null so callers degrade; a failed init resets the memo to retry.
export async function getClient() {
  if (_client) return _client;
  if (!isConfigured()) return null;               // no cloud -> local-only app
  if (_clientPromise) return _clientPromise;
  _clientPromise = (async () => {
    let createClient;
    try {
      const mod = await import(VENDOR_URL);
      createClient = mod && mod.createClient;
      if (typeof createClient !== 'function') throw new Error('createClient missing');
    } catch {
      _clientPromise = null;                       // allow a retry once online/cached
      return null;
    }
    try {
      _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true, autoRefreshToken: true,
          detectSessionInUrl: false,               // auth.js owns the magic-link callback
          flowType: 'pkce', storageKey: AUTH_STORAGE_KEY,
        },
        global: { headers: { 'x-client-info': 'my-app' } },
      });
      return _client;
    } catch { _clientPromise = null; return null; }
  })();
  return _clientPromise;
}
```

To produce `vendor/supabase-js.esm.js`: bundle `@supabase/supabase-js` to a single ESM
file with **zero external imports** (esbuild `--bundle --format=esm --platform=browser`),
commit it, and add it to the SW precache list. No secrets live in the client bundle — the
anon key is public-safe (RLS is the gate); service-role/AI keys are server-only.

## 2. Local store: one object store per entity + an outbox, UUIDs, client-set `updated_at`

```js
// store.js — IndexedDB via a thin promise wrapper, no libraries. All async.
const USER_STORES = ['profiles','programs','sessions','set_logs','adjustments','insights','records'];
// keyPath 'id' for every entity; the OUTBOX is autoIncrement 'seq' to preserve FIFO.
ensure('outbox', { keyPath: 'seq', autoIncrement: true }, []);
```

Non-negotiables that make sync correct:

- **Client-generated UUIDv4 ids** (`crypto.randomUUID()` + a `getRandomValues` fallback for
  old WebViews). Offline-first identity must survive sync — rows are minted with a stable id
  before any server round-trip.
- **Every domain write also enqueues an outbox op in the SAME helper** (`saveProfile`,
  `saveProgram`, …). A caller can't forget to queue. Public reference data (a seeded
  exercise/product catalog) does NOT enqueue.
- **`updated_at` is client-controlled.** There is deliberately **no DB auto-update
  trigger** — one would overwrite offline-created timestamps and corrupt LWW ordering. The
  client stamps `updated_at` on every write; the server preserves it.
- **Tiny UI state** (units, theme, `last_synced_at`, active-session id) lives in
  **localStorage** via `getUIState/setUIState`, never IndexedDB — WIP/recovery/cursor state
  is client-local and must not travel.

## 3. Sync: pull (LWW merge) + flush (outbox), all guarded no-ops

```js
// sync.js — syncNow() = pull then flush, then advance the cursor. Single-flight.
export async function syncNow() {
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    if (!isOnline())     return noop('offline');
    if (isSyncPaused())  return noop('paused');       // live-edit guard, below
    const client = await getClient(); if (!client) return noop('no-client');
    const userId = await sessionUserId(client); if (!userId) return noop('signed-out');
    // Pull FIRST so a fresh device hydrates before it re-pushes its own writes.
    const pr = await pullChangesInternal(client, userId).catch(() => ({ pulled: 0, ok: false }));
    const fr = await flushOutboxInternal(client, userId).catch(() => ({ pushed: 0, remaining: 0, ok: false }));
    return { ok: pr.ok && fr.ok, online: true, pulled: pr.pulled, pushed: fr.pushed, remaining: fr.remaining };
  })();
  try { return await _inFlight; } finally { _inFlight = null; }
}
```

**LWW merge** — the whole conflict model. Server wins only when its timestamp is
**strictly newer** than the local row's (equal ts → no-op, so `.gte(cursor)` boundary
re-pulls are cheap and idempotent):

```js
async function mergeLocal(db, storeName, serverRow, tsField) {
  const key = serverRow.id; if (key == null) return false;
  const local = await idbGet(db, storeName, key);
  const localTs = local ? String(local[tsField] || '') : '';
  const serverTs = String(serverRow[tsField] || '');
  if (local && !(serverTs > localTs)) return false;   // local same-or-newer -> keep
  await idbPut(db, storeName, serverRow);              // BYPASSES the outbox + PRESERVES server ts
  return true;
}
```

Two subtle rules baked into that: a pulled server row must (a) **bypass the outbox** — else
it echoes straight back up — and (b) **preserve the server timestamp** — using `store.save*`
would restamp `updated_at = now` and corrupt LWW ordering. So the pull path does raw
`idbPut`, never the enqueuing save helpers.

### Three guards that prevent lost updates and half-writes

- **Dirty-set guard (poll vs. save):** before merging, build a set of ids that have a
  pending outbox entry; **skip any pulled row whose id is dirty** (a queued local edit
  wins). Ids are globally-unique UUIDs so a flat id set suffices. Cousin of
  `offline-native-app/poll-vs-save-lost-update-guard.md`.
- **Pause guard (in-flight edit):** the editor wraps a committing write in
  `pauseSync()/resume()` so a background sync is deferred while a write is mid-flight —
  covers the window *before* the commit lands (the outbox dirty-set covers after).
- **Cursor advances only on a fully clean pull.** A per-table error keeps the old
  `last_synced_at` so the next run re-pulls that window (merges are idempotent) rather than
  silently skipping its changes forever. On flush, **stop on the first hard error and KEEP
  the queue intact** — a transient blip must never drop a pending write; a permanent 4xx
  (bad mapping) also stops and is surfaced by a post-deploy round-trip smoke, not swallowed.

### The denormalize/normalize seam (if your local shape ≠ your DB shape)

If the offline store is denormalized (one nested `program` with `days[]/exercises[]`) but
the DB is normalized (three tables), **sync is the only place that bridges them**: push
*decomposes* the nested object into parent+child upserts in FK-safe order (child ids are
already stable client UUIDs); pull *recomposes* the normalized rows back into the nested
shape. A wrong mapping is rejected by PostgREST as a 4xx that **stops the flush and keeps
the row queued** (never silent data loss) and is caught by a round-trip smoke. Also map any
reserved-word columns at this seam (`from`→`from_json`, quoted `"order"`).

Wire "back online → sync" via `window.addEventListener('online', …)`; `navigator.onLine` is
a hint (a captive portal can report a stale `true`), so a failed request just no-ops.

---

## Assumes / adapt

- **Assumes** no build step and ES modules in the browser (`<script type="module">`),
  Supabase with RLS scoping every table to `auth.uid()`, and a service worker that precaches
  the app shell + the vendored supabase-js (see `supabase-nextjs-pwa/pwa-auto-update-install.md`
  for the SW; keep the vendor file cache-first and live data network-first).
- **The vendor file is committed on purpose** — a CDN import would break the offline boot
  and add a third-party origin to your CSP. Re-vendor on supabase-js upgrades and re-test the
  offline cold-boot.
- **LWW is per-row, last-writer-wins** — fine for a single-user app (the only conflicts are
  the same person on two devices). For multi-user shared rows you need CRDTs or server-side
  merge; this pattern is deliberately the simple correct thing for single-owner data.
- **Append-only tables** (logs, records, audit) use `created_at`/`achieved_at` as the cursor
  and never need the dirty-set (they're never edited in place) — but keeping the uniform
  merge is harmless and simpler.
- Photos / privacy-sensitive media are deliberately kept OUT of this sync path — see
  `local-only-photo-store-isolation.md` in this domain.
