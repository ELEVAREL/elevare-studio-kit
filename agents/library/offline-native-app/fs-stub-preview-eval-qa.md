# In-memory FS stub + preview_eval verification (QA harness for File System Access API apps)

**When to reach for it:** QA-verifying an app built on the **File System Access API** (`showDirectoryPicker`, `getFileHandle`, on-disk JSON) that **can't be driven headless** — the picker needs a user gesture and a real directory, so `preview_click` through the real flow won't run in an automated harness. Instead of skipping verification (or claiming "looks fine"), replace the FS layer with an in-memory stub, seed state directly, call the render functions, and assert on the resulting DOM via `preview_eval`.

**Assumes / adapt:**
- The app's persistence goes through a small, swappable set of functions — typically `readJSON(folder, file)` / `writeJSON(folder, file, obj)` and a `queueWrite(fn)` serializer. If yours is scattered, that itself is the fix: funnel disk access through a couple of functions so it *can* be stubbed. (Good design falls out of making it testable.)
- You have the studio `preview_*` tools (start a static server via `.claude/launch.json`). Verify via `preview_eval` / DOM assertions / console — **not** screenshots (flaky in this environment).
- This proves render + state-transition logic against seeded data. It does **not** prove the real File System Access round-trip (picker → disk → reload) — call that out as separately checked (or manually verified) in the QA report.

## The harness

1. **Stub the FS layer in-memory.** Override the persistence functions before the app boots so nothing touches disk:
```js
// Injected in the preview page before app init (via preview_eval or a test bootstrap).
window.__fs = {};  // { "folder/file": obj }
window.readJSON  = async (folder, file) => window.__fs[folder + "/" + file] ?? null;
window.writeJSON = async (folder, file, obj) => { window.__fs[folder + "/" + file] = structuredClone(obj); };
window.queueWrite = fn => Promise.resolve().then(fn);   // no chaining needed in tests
```

2. **Seed identity + data directly.** Skip the login/picker gesture by setting the globals the app reads (current user `ME`, accounts `ACC`, and whatever `DB` sections the view needs):
```js
await window.eval(`
  ME  = { id:"u1", role:"admin", name:"Test User" };
  ACC = { admins:["u1"], accounts:[ME], audit:[] };
  window.__fs["data/sec-items.json"] = { items:[{ id:"a", title:"Seed" }] };
`);
```

3. **Call the view function directly** (bypass navigation), then assert on the rendered DOM:
```js
await window.eval(`renderItemsView()`);              // the real render fn
const html = await preview_eval(`document.querySelector("#view").innerHTML`);
// assert: expected rows present, no "undefined"/"[object Object]", counts correct
```

4. **Exercise a state transition, re-render, re-assert.** Prove the button actually mutates state correctly (pairs well with a click-path audit):
```js
await window.eval(`addItem({ id:"b", title:"Added" }); renderItemsView();`);
const count = await preview_eval(`document.querySelectorAll("#view .item").length`);
// assert count incremented AND the in-memory FS got the write:
const persisted = await preview_eval(`JSON.stringify(window.__fs["data/sec-items.json"])`);
```

5. **Confirm zero console errors** across the run (`preview_console_logs`) — a clean console is part of "verified".

## Why it works
- Swapping `readJSON`/`writeJSON` for an in-memory map removes the only thing that needs a real picker — the render and state logic are otherwise identical to production.
- Calling `*View()` functions directly sidesteps the login-gesture wall that blocks headless drivers.
- Asserting on `#view` DOM + the stub's contents verifies **both** what the user sees and what would have been persisted, without ever touching the disk.
