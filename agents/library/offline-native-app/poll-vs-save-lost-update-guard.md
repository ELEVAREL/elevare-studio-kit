# Poll-vs-save lost-update guard (background refresh that can't eat local edits)

**When to reach for it:** any app where a **background refresh** (poll of a shared file/DB/endpoint) and **user saves** touch the same in-memory state tree — multi-client shared-folder apps, "sync every N seconds" dashboards, collaborative-ish tools without a real server. The failure mode it kills: the poll fires between "user edited" and "save landed" (or *while* a save is queued) and replaces memory with pre-save storage state, silently discarding the edit. Two mechanisms, both required:

1. **A `_savePending` counter gates the poll** — skip when a save is queued/in-flight, and **re-check after every `await`** inside the poll (a save queued during the poll's async reads makes that poll stale).
2. **Section-wise merge with a per-key dirty guard** instead of wholesale state reassignment — accept storage for keys you haven't touched; keep the local value where `JSON.stringify(state[k]) !== loadedBaseline[k]` (an unsaved local edit).

**Assumes / adapt:**
- State is a JSON tree partitioned into **top-level sections** (`state.pages`, `state.docs`, …) and there's a **baseline map** `_loaded[k]` holding the JSON string of each section as last read-from/written-to storage. The same baseline powers the write side — see [`write-only-dirty-sections.md`](write-only-dirty-sections.md); the two entries are one protocol.
- `_savePending` is a **counter**, not a boolean — overlapping saves (queued writes) must keep the gate closed until the *last* one finishes (`finally{_savePending--}`).
- The post-`await` re-check is the piece hand-rolled versions miss: gate 1 passes, the poll `await`s its reads, the user hits Save during that await, gate-1's check is now stale. Returning early is safe — the next poll cycle re-reads.
- Dirty = *differs from baseline*, not a hand-set flag — it can't be forgotten by a mutation path that didn't call `markDirty()`.
- A section being dirty means the poll **keeps the local value and does not update its baseline** — so the next save still sees it as dirty and writes it. Two clients editing the *same* section concurrently is still last-writer-wins for that section (accepted; shrink sections if that hurts).
- Suppress the post-poll re-render (not the merge) while the user is mid-interaction: signature-compare to detect real change, and skip `render()` when a modal is open, focus is in an input, or a heavy editor view is active.
- Also gate the poll on `document.hidden` (don't hit the share while backgrounded) and on any in-flight upload.

```js
let _savePending=0;   // saves queued or in-flight — poll must not overwrite memory while one is pending
const _loaded={};     // per-section baseline: JSON string as last synced with storage

async function save(){_savePending++;return queueWrite(async()=>{
  try{
    for(const k of SECTION_KEYS){
      const cur=JSON.stringify(STATE[k]);
      if(_loaded[k]===undefined||cur!==_loaded[k]){      // write ONLY sections this client changed
        await writeSection(k,STATE[k]);
        _loaded[k]=cur;
      }
    }
  }finally{_savePending--;}
});}

let _lastSig="";
async function poll(){
  if(document.hidden)return;        // don't hit storage while backgrounded
  if(_uploadBusy)return;            // don't overwrite state mid-upload
  if(_savePending)return;           // GATE 1: a save is queued/in-flight — pulling now would
                                    // replace memory with pre-save storage state
  try{
    const d=await loadAllSections();
    if(_savePending)return;         // GATE 2: a save was queued while we were reading —
                                    // this poll is stale; the next cycle re-reads
    // Section-wise merge with a dirty guard: accept storage for sections we haven't
    // touched; KEEP any section whose in-memory value differs from its baseline
    // (an unsaved local edit) — a wholesale STATE=d here is how edits vanish.
    for(const k of Object.keys(d)){
      const localCur=STATE[k]===undefined?undefined:JSON.stringify(STATE[k]);
      const dirty=_loaded[k]!==undefined&&localCur!==undefined&&localCur!==_loaded[k];
      if(!dirty){STATE[k]=d[k];_loaded[k]=JSON.stringify(d[k]);}
    }
    // Re-render only on real change, and never mid-interaction.
    const sig=changeSignature(d);                        // e.g. lastPublish stamp + row counts
    const changed=sig!==_lastSig;_lastSig=sig;
    const t=document.activeElement,typing=t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if(changed&&!modalIsOpen()&&!typing&&CUR!=="editor")render();
    setConn(true);
  }catch(e){setConn(false);}
}
setInterval(poll,20000);window.addEventListener("focus",poll);
```
