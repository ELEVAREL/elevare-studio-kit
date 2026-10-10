# Restore-from-backup UI + corrupt-file protection

**When to reach for it:** a client-side app that owns its own data on disk (File System Access API, or any store the user could corrupt/partially-write) and has **no server to fall back on**. This is the recovery path a *non-author* actually needs when something goes wrong: timestamped whole-workspace snapshots, a loud "some data couldn't be read" banner, a **corrupt-but-present guard** that refuses to auto-overwrite files it couldn't parse, and a restore modal that rolls the whole workspace back to a chosen snapshot (backing up current state first).

**Assumes / adapt:**
- Data is split into named files/sections you can snapshot and restore as a group (here `data`, `accounts`, `appointments`). Adapt the prefixes to your store.
- **Timestamped snapshots** written to a `backup/` folder on save; **prune per-type** keeping the newest N. Prune per prefix — a naive `names.sort().slice()` across mixed prefixes deletes *all* of the lexicographically-oldest type first (e.g. every `accounts-*`) before touching the others. The grouped prune below avoids that.
- **The corrupt-file guard is the crucial bit.** When a file *exists* but can't be read (bad JSON, failed signature, undecryptable) **and** there's no good `.bak`, add its path to a `_corruptFiles` set. Then: (a) show the banner, (b) render blank/default for that section, and (c) **NEVER let a save overwrite a path in that set** — otherwise the first autosave silently destroys the recoverable-but-unreadable original. Guard every default-write path with `if(_corruptFiles.has(path)) continue;`.
- Restore **backs up current state first** (`backup()` before overwrite) so "restore" is itself undoable, then force-rewrites every section from the restored objects (clear any "already loaded" cache so nothing is skipped) and reloads.
- Show timestamps in a human format, newest-first. Word the banner for a scared non-technical user: *their other data is safe, don't rebuild the blank section, restore first.*

```js
// ---- Timestamped whole-workspace snapshot, pruned per type ----
async function backup(){
  try{
    const ts=new Date().toISOString().replace(/[:.]/g,"-");
    const bd=await ROOT.getDirectoryHandle("backup",{create:true});
    for(const [n,o] of [["data-"+ts+".json",DB],["accounts-"+ts+".json",ACC],["appointments-"+ts+".json",DB.appointments||[]]]){
      const fh=await bd.getFileHandle(n,{create:true});const w=await fh.createWritable();await w.write(JSON.stringify(o));await w.close();
    }
    // Prune PER TYPE — keep newest 20 of each prefix. A flat sort would nuke one whole type first.
    const names=[];for await(const [n] of bd.entries())names.push(n);
    const groups={};
    names.forEach(n=>{const m=n.match(/^(.*?)-\d.*\.json$/);(groups[m?m[1]:"_other"]=groups[m?m[1]:"_other"]||[]).push(n);});
    for(const pre in groups){
      const g=groups[pre].sort();                     // ISO timestamps sort chronologically
      for(const n of g.slice(0,Math.max(0,g.length-20))) try{await bd.removeEntry(n)}catch(e){}
    }
  }catch(e){console.warn("backup",e);}
}

// ---- Corrupt-file guard: existed + unreadable + no good .bak -> flag, never overwrite ----
let _corruptFiles=new Set();
async function readJSON(folder,file){
  // ...on parse/verify failure, after trying a `.bak`:
  //   _corruptFiles.add(folder+"/"+file);   // flag for restore
  //   return null;                          // caller shows default, but must NOT save over it
}
// In every default-write path:
//   if(_corruptFiles.has("data/sec-"+key+".json")) continue;   // NEVER overwrite an unreadable original

// ---- Loud banner when something couldn't be read ----
function showCorruptBanner(){
  if(document.getElementById("corruptBanner"))return;
  const list=[..._corruptFiles].join(", ");
  const b=document.createElement("div");
  b.id="corruptBanner";
  b.style.cssText="position:fixed;top:0;left:0;right:0;z-index:99998;background:#3b1010;color:#ffd0d0;border-bottom:2px solid #e63946;padding:10px 14px;font:13px sans-serif";
  b.innerHTML="⚠ <b>Some data couldn't be read</b> ("+esc(list)+"). Your other data is safe. Those sections are showing blank/default — <b>do not rebuild or save them</b>, restore first. "+
    "<button onclick='restoreFromBackupModal()'>Restore from backup…</button> <button onclick='this.parentNode.remove()'>Dismiss</button>";
  document.body.appendChild(b);
}

// ---- Restore modal: pick a snapshot, roll the WHOLE workspace back (backing up current first) ----
async function listBackups(){
  try{
    const bd=await ROOT.getDirectoryHandle("backup"); const ts=new Set();
    for await(const [n] of bd.entries()){const m=n.match(/^(?:data|accounts|appointments)-(.+)\.json$/);if(m)ts.add(m[1]);}
    return [...ts].sort().reverse();                  // newest first
  }catch(e){return [];}
}
async function restoreBackup(ts){
  confirmModal("Restore the entire workspace from the "+ts+" backup? Current data will be replaced (a backup of it is taken first).",async()=>{
    try{
      const bd=await ROOT.getDirectoryHandle("backup");
      const rd=async pfx=>{try{const fh=await bd.getFileHandle(pfx+"-"+ts+".json");return JSON.parse(await(await fh.getFile()).text());}catch(e){return null;}};
      try{await backup();}catch(e){}                  // snapshot current state BEFORE overwriting — restore is undoable
      const d=await rd("data"),a=await rd("accounts"),ap=await rd("appointments");
      if(d&&typeof d==="object")DB=d;
      if(ap&&Array.isArray(ap))DB.appointments=ap;
      if(a&&typeof a==="object")ACC=a;
      _corruptFiles.clear();
      _dbLoaded={};                                   // force every section to rewrite from the restored state
      await saveDB();await saveAccounts();
      toast("Restored from "+ts+" ✓ — reloading");
      setTimeout(()=>location.reload(),900);
    }catch(e){toast("Restore failed: "+e.message,1);}
  },"Restore");
}
```
