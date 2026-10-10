# Snapshot undo/redo stack for a JSON editing tree

**When to reach for it:** you're building an editor over a small-to-medium JSON state tree (a page builder's rows/columns/blocks, a form schema, a diagram model, a settings object) and want undo/redo without the ceremony of a command/inverse-op pattern. This snapshots the *whole* state as a JSON string before each mutation. Simpler and near-impossible to desync for small trees; not appropriate for large documents or high-frequency edits (snapshot cost is O(state size) per step).

**Assumes / adapt:**
- The editing state must be **JSON-serializable** (no functions, DOM nodes, or cycles). Snapshots are `JSON.stringify(state)`; restore is `JSON.parse`.
- Snapshot **before** a mutation (`snapshot()` at the top of every structural op — add/delete/move/reorder). New edits **clear the redo stack**.
- **No-op dedupe:** if the new snapshot equals the top of the undo stack, don't push — just mark dirty and autosave. Ops that snapshot defensively but end up changing nothing (a cancelled drag, a re-select, setting a field to its current value) would otherwise burn undo steps, and Ctrl+Z would "do nothing" several times before visibly undoing.
- **Cap the undo stack by count AND aggregate bytes.** A count cap alone assumes small snapshots — but a JSON tree containing base64 blobs (inline images, file payloads) can make one snapshot multi-MB, and 60 of those is hundreds of MB of strings. Sum `s.length` across the stack and `shift()` the oldest while over ~15 MB (always keeping at least one step).
- **One undo step per typing burst.** A raw `input` listener would push a snapshot per keystroke. `touch()` snapshots on the *first* keystroke of a burst, then debounces (~900 ms) so continuous typing collapses into a single undo step.
- **Let native undo win inside text fields.** The keydown handler skips when focus is in an `INPUT`/`TEXTAREA`/`contenteditable` — otherwise Ctrl+Z would yank the whole block instead of un-typing a character. This is the detail most hand-rolled undo gets wrong.
- Bindings: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z **or** Ctrl+Y = redo.
- Store `undo`/`redo` on the editor session object (here `BLD`) so closing the editor drops the history. After a restore, re-validate the current selection (a snapshot may not contain the currently-selected node).
- Pairs naturally with an autosave draft — call the autosave from `snapshot()` so every undoable change is also crash-protected (see [`autosave-draft-unsaved-guard.md`](autosave-draft-unsaved-guard.md)).

```js
// State lives on the editor session: e.g. BLD = { rows:[...], sel, undo:[], redo:[], dirty:false }

function snapshot(){ // call BEFORE any structural mutation
  if(!BLD)return;
  const snap=JSON.stringify(BLD.rows);
  if(BLD.undo.length&&BLD.undo[BLD.undo.length-1]===snap){ // no-op mutation —
    BLD.dirty=true;autosaveDraft();return;                 // don't burn an undo step
  }
  BLD.undo.push(snap);
  // Bound memory by count AND aggregate bytes — snapshots holding base64 blobs
  // (inline images) can be multi-MB each; 60 of those would be hundreds of MB.
  let bytes=0;for(const s of BLD.undo)bytes+=s.length;
  while(BLD.undo.length>60||(bytes>15_000_000&&BLD.undo.length>1)){
    bytes-=BLD.undo[0].length;BLD.undo.shift();
  }
  BLD.redo=[];                                // a new edit invalidates the redo branch
  BLD.dirty=true;
  autosaveDraft();                            // optional: also crash-protect the change
}
function undo(){
  if(!BLD||!BLD.undo.length)return;
  BLD.redo.push(JSON.stringify(BLD.rows));
  BLD.rows=JSON.parse(BLD.undo.pop());
  BLD.dirty=true;
  if(BLD.sel&&!selectionStillValid())BLD.sel=null;   // restored tree may not contain the selection
  rerender();
}
function redo(){
  if(!BLD||!BLD.redo.length)return;
  BLD.undo.push(JSON.stringify(BLD.rows));
  BLD.rows=JSON.parse(BLD.redo.pop());
  BLD.dirty=true;
  if(BLD.sel&&!selectionStillValid())BLD.sel=null;
  rerender();
}

// One undo step per typing burst (call from a text field's `input` handler instead of snapshot()).
let _typing=null;
function touch(){
  if(!BLD)return;
  if(_typing===null)snapshot();               // first keystroke of the burst -> one snapshot
  else clearTimeout(_typing);
  _typing=setTimeout(()=>{_typing=null;},900); // burst ends after 900ms idle
}

// Keyboard: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo — but NEVER inside a text field.
document.addEventListener("keydown",e=>{
  if(!BLD)return;
  const t=e.target, editable=t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.isContentEditable);
  const mod=e.ctrlKey||e.metaKey, k=(e.key||"").toLowerCase();
  if(mod&&!e.shiftKey&&k==="z"&&!editable){e.preventDefault();undo();}
  else if(mod&&(k==="y"||(e.shiftKey&&k==="z"))&&!editable){e.preventDefault();redo();}
});
```
