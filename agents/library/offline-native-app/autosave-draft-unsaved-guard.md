# Autosave-draft + unsaved-work guard

**When to reach for it:** any editor where losing the session hurts — a page/form builder, a long note, a multi-field record. Two complementary safety nets: (1) a **debounced crash-recovery draft** written silently to **localStorage, keyed per document id**, so a crash / idle-lock / accidental close can't wipe 20 minutes of work, with a "restore this draft?" prompt on reopen; and (2) a **`beforeunload` guard** that warns before leaving while a dirty flag (or an in-flight upload / open modal) is set.

**Drafts belong in localStorage, not shared storage.** A crash-recovery draft is *single-client* state — it doesn't need to travel. The first version of this pattern wrote the draft into a `_wip` field on the shared record; in a multi-client app that cost a full shared-storage save per debounce tick, doubled the record's on-disk size, and shipped one user's half-typed draft to every other client's poll (see STANDARDS "Don't lose the user's work"). The trade: a localStorage draft won't follow the user to another machine — that's what an explicit "Save draft" is for.

**Assumes / adapt:**
- One localStorage key per document (`"<app>-wip-"+docId`) so drafts for different documents never collide, and the draft lives entirely beside the committed value — never over it. (If your store is genuinely single-client — one user, one machine, no sync — a `_wip` field on the record works too; the locality rule only bites when others can see your writes.)
- The draft is a deep snapshot (`JSON.stringify` of the working tree) so it doesn't alias live state.
- **Debounce** the autosave (2–5 s), resetting the timer on every change; call it from every mutation (cheapest: from `snapshot()` in the undo stack, so every undoable change is also crash-protected — see [`snapshot-undo-redo-stack.md`](snapshot-undo-redo-stack.md)).
- Wrap every localStorage touch in `try/catch` — quota-exceeded and private-mode failures must degrade to "no draft," never to a thrown error mid-edit.
- On **open**, if a draft exists and differs from the committed value, offer to restore it (don't auto-apply — the user may want the published version). Set the dirty flag when they accept.
- On **clean save/publish** AND on **explicit cancel/discard**, clear the draft *and* cancel the pending debounce timer — otherwise a queued tick resurrects the draft you just cleared.
- **Migrating from a shared-field draft:** honor the legacy `record._wip` once as a restore source, then delete it and save — one-time inline cleanup, no separate migration pass.
- `beforeunload`: modern browsers ignore custom text and show their own prompt; you still must call `e.preventDefault()` and set `e.returnValue`. Only guard when there's genuinely unsaved state — a guard that fires on every navigation gets muscle-memoried away. Combine multiple conditions (dirty editor **or** running upload **or** open modal).
- Pairs with restore-from-backup for the harder recovery case (see [`restore-from-backup-corrupt-guard.md`](restore-from-backup-corrupt-guard.md)).

```js
// ---- Debounced crash-recovery draft, per document, in LOCALSTORAGE (per-machine) ----
function wipKey(docId){return "myapp-wip-"+docId;}
let _autoT=null;
function autosaveDraft(){                          // call from every mutation (e.g. inside snapshot())
  if(_autoT)clearTimeout(_autoT);
  _autoT=setTimeout(()=>{
    if(!ED)return;
    try{localStorage.setItem(wipKey(ED.docId),JSON.stringify(ED.rows));}catch(e){}
  },5000);
}
function wipRead(docId){try{return JSON.parse(localStorage.getItem(wipKey(docId))||"null");}catch(e){return null;}}
function wipClear(docId){if(_autoT)clearTimeout(_autoT);try{localStorage.removeItem(wipKey(docId));}catch(e){}}

// ---- On open: offer to restore an unsaved draft from a previous session ----
function openEditor(docId){
  const rec=findRecord(docId);
  ED={docId, rows:JSON.parse(JSON.stringify(rec.rows||[])), undo:[], redo:[], dirty:false};
  renderEditor();
  const wip=wipRead(docId)||rec._wip||null;        // legacy shared-field draft honored once…
  if(rec._wip){delete rec._wip;saveDB();}          // …then cleaned up (one-time migration)
  if(wip && JSON.stringify(wip)!==JSON.stringify(rec.rows)){
    confirmModal("Unsaved changes from a previous session were found. Restore them?",()=>{
      ED.rows=JSON.parse(JSON.stringify(wip));
      ED.dirty=true; renderEditor();
      toast("Recovered unsaved work — Save to keep it.");
    },"Restore");
  }
}

// ---- On clean save AND on discard: drop the draft (and its pending timer) ----
function commit(){ /* …write rec.rows… */ wipClear(ED.docId); ED.dirty=false; saveDB(); }
function discard(){ confirmModal("Discard unsaved changes?",()=>{ wipClear(ED.docId); ED=null; go("list"); }); }

// ---- beforeunload guard: warn only when there is real unsaved state ----
window.addEventListener("beforeunload",e=>{
  const modalOpen  = modalIsOpen();
  const uploading  = uploadsInFlight();
  const dirtyEdit  = (ED && ED.dirty);
  if(modalOpen||uploading||dirtyEdit){
    e.preventDefault();
    e.returnValue = uploading ? "Uploads are still in progress. Leave anyway?"
                  : dirtyEdit ? "You have unsaved changes. Leave anyway?"
                  : "You have an open form. Leave anyway?";
  }
});
```
