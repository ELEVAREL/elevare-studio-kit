# Lazy-load heavy vendor libs (on-demand, still 100% offline)

**When to reach for it:** a heavy vendor library (xlsx, jspdf + autotable, a charting lib, a PDF engine) is needed by *one* feature but not at startup. Instead of a `<script>` in `<head>` that everyone pays for on first paint, ship the lib locally and load it the moment the feature is first used. Keeps startup fast while staying fully offline (the file is bundled under `libs/`, not fetched from a CDN).

**Assumes / adapt:**
- The vendor files are shipped **with the app** (e.g. `libs/xlsx.full.min.js`) so this works with no network — swap the paths for your own vendored copies. Do not point these at a CDN if "offline" is a requirement.
- `loadScriptOnce` dedupes by `src`: concurrent callers share one load, and a second call after load resolves immediately. It tags the injected tag with `data-lazy` + `data-loaded`.
- Wrap each lib in an `ensureX()` that (a) short-circuits if the global is already present, (b) loads, (c) returns a boolean so callers can degrade gracefully instead of throwing. Call `ensureX()` at the **feature entry point** (e.g. top of an `exportToExcel()` handler), then guard on the result.
- For libs with a plugin (jspdf + autotable) load the base then the plugin, and check both are ready.

```js
// Load a script exactly once; concurrent + repeat callers share the same promise.
function loadScriptOnce(src){
  return new Promise((res, rej) => {
    const ex = document.querySelector('script[data-lazy="' + src + '"]');
    if (ex){
      if (ex.dataset.loaded) return res();               // already loaded
      ex.addEventListener("load",  () => res());          // in flight — piggyback
      ex.addEventListener("error", () => rej());
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.dataset.lazy = src;
    s.onload  = () => { s.dataset.loaded = "1"; res(); };
    s.onerror = () => rej(new Error("load " + src));
    document.head.appendChild(s);
  });
}

// One ensureX() per lib — idempotent, returns readiness so callers can degrade.
async function ensureXLSX(){
  if (typeof XLSX !== "undefined") return true;
  try { await loadScriptOnce("libs/xlsx.full.min.js"); } catch(e){}
  return typeof XLSX !== "undefined";
}

async function ensureJsPDF(){
  if (jsPDFReady() && autoTableReady()) return true;
  try {
    await loadScriptOnce("libs/jspdf.umd.min.js");
    await loadScriptOnce("libs/jspdf.plugin.autotable.min.js");
  } catch(e){}
  return jsPDFReady() && autoTableReady();
}
```

**Use it at the feature entry point, and degrade if it can't load:**

```js
async function exportToExcel(rows){
  if (!await ensureXLSX()){ toast("Excel export unavailable", true); return; }
  // ...safe to use XLSX here...
}
```

---

## Companion: clear failure messaging when a program file won't load

Lazy-loading trades a startup cost for a *runtime* failure mode: the file might be missing, blocked, or deleted when the feature is first used. Don't let that surface as a raw `throw` or a dead button. Two places to add plain-language recovery instructions for a non-technical user of a zero-server app:

**1. Feature-level (the `ensureX()` degrade path, above):** on failure, `toast(...)` an actionable message — *"Excel export unavailable — restore `libs/xlsx.full.min.js` next to the app, then reload"* — instead of throwing. Callers already guard on the returned boolean, so the feature simply no-ops with an explanation.

**2. Startup self-check for required program files:** for the app's *own* split-out `.js` modules (not optional vendor libs), verify at boot that each one registered its global, and show a loud banner naming any that are missing/blocked so a deleted file is obvious rather than a silently broken feature.

```js
// At DOMContentLoaded: each module sets a known global when it loads.
const need={
  "libs/animations.js":window.Anim, "libs/data.js":window.AppData,
  "libs/boards.js":window.Boards,   "libs/admin.js":window.Admin,
  // ...one entry per required module...
};
const missing=Object.keys(need).filter(k=>!need[k]);
if(missing.length){
  const b=document.createElement("div");
  b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:99999;background:#3b1010;"+
    "color:#ffd0d0;border-bottom:2px solid #e63946;padding:10px 14px;font:13px sans-serif";
  b.textContent="⚠ Program file(s) missing or blocked: "+missing.join(", ")+
    ". Restore them in the libs/ folder next to the app from your backup copy, then reload. "+
    "Some features are disabled until then.";
  document.body.appendChild(b);
}
```

This is the sibling of the [`secure-context-boot-guard.md`](secure-context-boot-guard.md) — both convert a cryptic/silent startup failure into a plain-language "here's how to recover" instruction.
