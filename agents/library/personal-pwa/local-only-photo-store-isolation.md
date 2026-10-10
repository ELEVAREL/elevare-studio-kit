# Local-only IndexedDB media store, structurally isolated from sync

**When to reach for it:** an app that holds **privacy-sensitive user media the owner must
never be able to access** — progress photos, personal documents, voice notes, anything the
user was promised stays on their device. The rule "this never leaves the phone" can't be a
checkbox or a `if (!shouldSync)` branch someone can forget; it has to be **structural**. The
technique: give the media its **own IndexedDB database**, completely separate from the synced
store, in a module that imports neither the sync layer nor the cloud client. Pairs with
`offline-first-vendored-supabase-sync.md` (the synced side) — this is the deliberately
un-synced counterpart.

Why a separate database, not a flag on the existing store: a shared store means the sync
layer *can* reach the blobs, and isolation depends on every future writer remembering to
exclude them. A separate DB the sync layer never opens means the blob is **unreachable by
construction** — the sync code has no handle to it, no store name for it, no code path to it.

---

## The isolation contract (the comment IS the enforcement)

```js
// photos.js — LOCAL ONLY. Media lives ONLY in the browser's IndexedDB on device.
// Never synced, never written to the cloud, never in the outbox, never in the
// sync export payload. To GUARANTEE that, this module opens its OWN database,
// separate from the synced store, and imports NOTHING from store.js / sync.js /
// the Supabase client.
const DB_NAME = 'app-media';   // <- a DIFFERENT database from the synced 'app' DB
const DB_VERSION = 1;
const STORE = 'photos';
```

And on the sync side, the isolation is asserted the same way — a comment that is a promise the
code keeps by never listing the media store:

```js
// sync.js — MEDIA IS NEVER TOUCHED. This module only ever opens the synced DB and
// only reads/writes the SYNCED_TABLES below. It never opens 'app-media', never
// reads a media blob, never enqueues or uploads one. Isolation is structural.
const SYNCED_TABLES = [ /* profiles, programs, sessions, … — 'app-media' is ABSENT */ ];
```

Because the blob store is a different `indexedDB.open(name)`, and `sync.js` only ever opens the
synced DB by its name, there is **no line of code anywhere that could carry a photo to the
cloud**. The outbox (which sync flushes) is in the synced DB; the media DB has no outbox and no
enqueue path.

## The store: blobs on device, meta cheap to list

```js
// Standard IndexedDB open, keyPath 'id', indexes on the fields you filter by.
os.createIndex('date', 'date', { unique: false });
os.createIndex('kind', 'kind', { unique: false });

export async function savePhoto({ blob, date, kind = 'progress', pose = '', note = '' } = {}) {
  if (!blob) throw new Error('blob required');
  const id = uuid();
  const record = { id, blob, /* the image lives ONLY here */
    date: date || new Date().toISOString().slice(0, 10),
    kind, pose: String(pose), note: String(note),
    type: blob.type || 'image/jpeg', size: blob.size || 0,
    created_at: new Date().toISOString() };
  await tx('readwrite', (store) => reqToPromise(store.put(record)));
  return id;
}

// List returns META ONLY (no blob) — cheap; blobs are fetched on demand by id.
export async function getPhotos(filter = {}) { /* getAll -> strip .blob -> sort newest-first */ }
export async function getPhotoBlob(id) { /* fetch one blob by id */ }
```

`deleteAllPhotos()` drops the **entire** media database with
`indexedDB.deleteDatabase(DB_NAME)` (closing the cached connection first, resolving on
`onblocked` anyway) rather than deleting rows one-by-one — a "delete everything" flow that
leaves rows behind mid-loop is a privacy failure. Whole-DB drop is the atomic guarantee.

## The one allowed network touch: transient analysis that persists nothing

If the media can be *analyzed* (an optional AI look at a photo), the blob is base64-encoded and
POSTed **once** to a serverless endpoint that itself **stores nothing** — the blob still only
ever persists locally. This stays inside the isolation contract because nothing is written
anywhere durable off-device:

```js
// The ONLY network touch: optional, transient. The endpoint stores nothing; the
// blob is never persisted server-side. Returns null offline / not-authed / over-cap.
export async function analyzePhoto(blob, kind, note) { return coachAnalyzePhoto(blob, kind, note); }
```

Make the server side's non-persistence real and auditable: the analyze route reads the image
into memory, calls the model, returns text, and never writes to Storage or a table (no photos
table exists in the schema at all). "Transient" has to be verifiable in the code, not just
claimed in a comment.

## Export goes to the user's own device, dependency-free

The user can take their media *with them* — a real downloadable archive built in-browser with
no library (a ~60-line store-method ZIP: CRC32 + local headers + central directory + EOCD),
bundling every blob plus a `manifest.json`. The export is a download to their device, never an
upload. This is the honest completion of "it's yours and it stays yours": they can get it out,
and the only way it leaves the phone is if *they* carry it.

---

## Assumes / adapt

- **Assumes** an offline-first app that syncs *other* data to a cloud (this is the carve-out
  from that sync). If nothing syncs, you don't need the isolation — but a separate DB is still
  a clean way to keep large blobs out of the small synced store's transactions.
- **The separate database name is the whole mechanism** — don't "optimize" media into the
  synced store with a skip flag. The isolation is that the sync code has no name to open.
- **Keep the module dependency-free of the sync side** — no `import` from the store or cloud
  client. If it can't reach them, it can't leak through them. A lint rule / grep test asserting
  `photos.js` imports nothing from `sync.js`/`store.js`/the client is worth adding.
- **The schema must have no table for the media** — if there's nowhere on the server to put it,
  a future accidental write has nowhere to land. Absence of the table is part of the guarantee
  (note it in the DB README).
- **If analysis must be logged** (usage/billing), log the *event* (a row: user, timestamp,
  tokens) — never the media. Meter the call, store the metric, drop the pixels.
- Blobs count against the browser's storage quota and can be evicted under pressure; if the
  media is precious, prompt the user to export periodically and consider
  `navigator.storage.persist()`.
