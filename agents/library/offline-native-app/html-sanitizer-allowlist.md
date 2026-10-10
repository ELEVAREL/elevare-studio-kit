# Allowlist HTML sanitizer — the contenteditable / rich-text XSS boundary

**When to reach for it:** any time user- or editor-authored HTML is written into the DOM via `innerHTML` — a `contenteditable` rich-text block, a stored WYSIWYG value, a Markdown-to-HTML render, imported/pasted HTML. This is the XSS boundary. `sanitizeHTML()` rebuilds the tree with `DOMParser`, keeps only an allowlist of tags, **drops ALL attributes** except a scheme-checked `href`, drops `<script>`/`<style>` entirely (including their text content), and **unwraps** unknown tags while keeping their cleaned children. Apply it on **both save and render** (defense in depth) — never trust that stored HTML was already clean.

**Assumes / adapt:**
- Needs a DOM (`DOMParser`, `document.createElement`). Browser-only; for SSR/Node use a real library (DOMPurify) instead — this is the zero-dependency, offline-app version.
- Pairs with `safeUrl` (URL scheme allowlist — see [`export-hardening-helpers.md`](export-hardening-helpers.md)); the sanitizer calls it for every `A` href. Keep the two together.
- **Attributes are dropped wholesale** — no `style`, `class`, `id`, `on*`, `srcset`, nothing but the rebuilt `href`. If you must allow an attribute (e.g. `colspan` on tables), add it explicitly and value-check it; never pass attributes through by copying `n.attributes`.
- `A` links get a **fresh** `href` (via `safeUrl`) plus `target="_blank"` + `rel="noopener noreferrer"` — a hardcoded, safe set, not copied from source.
- Edit the `ALLOW` map to fit your content model (here: block text, inline emphasis, lists, headings, links, blockquote). Adding `IMG` means also allowlisting+scheme-checking `src` (and consider `data:`/`blob:` policy).
- **Mutation-XSS (mXSS) note:** because you sanitize a string and then re-serialize with `.innerHTML`, the *output* string is what matters, not the input. Rebuilding via `createElement` + `createTextNode` (never copying raw markup) avoids the classic mXSS reparse traps. Do **not** "optimize" by assigning `n.innerHTML` into the destination — that reintroduces the reparse gap. Also: sanitize at render time too, so a value poisoned by a *different* code path (or an older, laxer sanitizer version) is still cleaned before it hits the DOM.
- Comments (`nodeType 8`) and everything that isn't an element or text node are silently dropped.

```js
// Used both when SAVING from the editor AND when RENDERING the stored value (defense in depth) —
// this is the XSS boundary, since the HTML is written to the DOM via innerHTML.
function sanitizeHTML(html){
  const ALLOW={P:1,BR:1,B:1,STRONG:1,I:1,EM:1,U:1,A:1,UL:1,OL:1,LI:1,H2:1,H3:1,H4:1,BLOCKQUOTE:1};
  let doc;try{doc=new DOMParser().parseFromString("<body>"+(html||"")+"</body>","text/html");}catch(e){return "";}
  function clean(src,dst){
    src.childNodes.forEach(n=>{
      if(n.nodeType===3){dst.appendChild(document.createTextNode(n.nodeValue));return;} // text — keep as text
      if(n.nodeType!==1)return;                                  // drop comments / everything else
      const tag=n.tagName;
      if(tag==="SCRIPT"||tag==="STYLE")return;                   // drop entirely, including text content
      if(ALLOW[tag]){
        const el=document.createElement(tag);                    // fresh element — NO attributes copied
        if(tag==="A"){                                           // the only allowed attribute, scheme-checked + hardened
          el.setAttribute("href",safeUrl(n.getAttribute("href")||"#"));
          el.setAttribute("target","_blank");
          el.setAttribute("rel","noopener noreferrer");
        }
        clean(n,el);dst.appendChild(el);
      }else{clean(n,dst);}                                        // unwrap unknown tag, keep cleaned children
    });
  }
  const out=document.createElement("div");clean(doc.body,out);return out.innerHTML;
}
```

**Wire it into the editor on input, paste, and render:**

```js
// contenteditable input: clean before storing
rte.addEventListener("input",()=>{ block.html=sanitizeHTML(rte.innerHTML); /* …live refresh… */ });

// paste: prefer the HTML flavor cleaned, else escape the plaintext
rte.addEventListener("paste",ev=>{
  ev.preventDefault();
  const cd=ev.clipboardData||window.clipboardData;
  const html=cd?cd.getData("text/html"):"", text=cd?cd.getData("text/plain"):"";
  const clean=html?sanitizeHTML(html):esc(text).replace(/\n/g,"<br>");
  try{document.execCommand("insertHTML",false,clean);}catch(e){}
  rte.dispatchEvent(new Event("input"));
});

// render (published/read view): sanitize AGAIN, never trust the stored string
container.innerHTML = sanitizeHTML(block.html||"");
```
