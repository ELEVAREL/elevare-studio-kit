# Write only changed sections; the poll is the sole merge path

**When to reach for it:** a multi-client app persisting a sectioned JSON state tree to shared storage (one file per top-level section) where saves were doing defensive read-backs "to be safe" — re-reading every unchanged section from storage at save time before writing. This entry is the reasoning + code for deleting that: **save writes only dirty sections (stringify-compare against the loaded baseline) and never reads unchanged sections back; the visibility-gated background poll is the app's only merge path.** In the source app this cut save traffic ~5x with zero loss of the no-clobber guarantee.

This is the **write side** of [`poll-vs-save-lost-update-guard.md`](poll-vs-save-lost-update-guard.md) (the read/poll side); they share the `_loaded[k]` baseline map and only work together.

**Why the write gate alone preserves the no-clobber guarantee** (the interleaving argument):

Setup: clients A and B, sections `s1`, `s2`. A has edited `s1` only; B has edited `s2` only. Storage holds B's fresh `s2`, which A's memory doesn't have yet.

| # | Interleaving | With save-time read-back | With write-gate only |
|---|---|---|---|
| 1 | A saves; A's memory has a stale `s2` | Read-back refreshes A's `s2`, then A writes… only `s1` anyway | A writes only `s1` (its sole dirty section). **B's `s2` on disk is untouched — nothing to protect it from.** A's *memory* stays stale until the next poll merges `s2` in. |
| 2 | A saves while B's `s2` write is mid-flight | Read-back might catch pre- or post-write `s2` — a coin flip, not a guarantee | Same as #1: A never writes `s2`, so the flight order is irrelevant. |
| 3 | A and B both edited the **same** section | Read-back doesn't help — A overwrites B's value with its own regardless (you can't merge by re-reading) | Identical outcome: last writer wins for that one section. This is the residual conflict in **both** designs; only smaller sections or real merging fix it. |
| 4 | A's poll races A's own save | N/A | Handled on the poll side (the `_savePending` gates), not here. |

The punchline: clobber happens at **write** time, so the only thing that prevents it is *not writing sections you didn't change*. Reading them back first adds share traffic and save latency and changes no outcome — the read-back protected nothing.

**Assumes / adapt:**
- One storage unit per top-level section (e.g. `sec-<key>.json`) so a section write can't disturb its siblings. If everything lives in one monolithic file, split it first — a whole-file write is an unconditional clobber of every other client's sections.
- `_loaded[k]` = JSON string of section `k` as last synced with storage. Update it on every write **and** on every poll-merge accept. `undefined` baseline (new section) counts as dirty.
- Dirtiness is *recomputed by comparison*, never a hand-set flag — mutation paths can't forget it.
- Cheap for small-to-medium sections (stringify per save is O(section size)); if one section grows huge, split it, don't add flags.
- Freshness of *memory* (not disk) is the poll's job. If your app has no background poll, saves silently diverge — add the poll-side entry first.

```js
const _loaded={};   // section key -> JSON string as last synced with storage (shared with the poll)

async function save(){_savePending++;return queueWrite(async()=>{
  try{
    STATE.meta.lastPublish=now();               // change signature for other clients' polls
    for(const k of SECTION_KEYS){
      const cur=JSON.stringify(STATE[k]);
      if(_loaded[k]===undefined||cur!==_loaded[k]){
        await writeSection(k,STATE[k]);         // write ONLY the sections this client changed
        _loaded[k]=cur;
      }
      // Unchanged sections are left alone. The background poll is the merge path for
      // other clients' edits — a save-time read-back of unchanged sections protects
      // nothing (the write gate above is what prevents cross-section clobber) and
      // multiplies storage traffic.
    }
  }finally{_savePending--;}
});}
```
