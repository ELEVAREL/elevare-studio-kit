# Export hardening helpers — CSV cell escaper + URL scheme allowlist

**When to reach for it:** two tiny helpers every export/link surface needs. Reach for `csvCell` whenever you build a CSV from user/data values (dl to a file, clipboard, report). Reach for `safeUrl` whenever a user-supplied or data-driven URL is written into an `href` — it blocks `javascript:`/`data:` scheme injection by allowlisting safe schemes.

**Assumes / adapt:**
- `csvCell` follows **RFC 4180**: wrap every cell in double quotes and double any embedded quote. This also neutralizes commas and newlines inside a value. Join cells with `,` and rows with `\n`.
  - *Not covered:* CSV formula injection (a cell starting with `=`, `+`, `-`, `@` that Excel evaluates). If exports are opened in a spreadsheet by untrusted parties, additionally prefix such cells with a `'` or a leading space.
- `safeUrl` allowlists `http(s):`, `mailto:`, `tel:`, and same-origin/relative refs (`/`, `#`, `.`); anything else (notably `javascript:` and `data:`) collapses to `"#"`. Pair it with your HTML escaper on the way into the attribute, and always add `rel="noopener noreferrer"` on `target="_blank"` links.

```js
// RFC 4180 CSV cell: quote-wrap, double internal quotes. Handles commas/newlines/quotes.
const csvCell = v => '"' + (v == null ? "" : String(v)).replace(/"/g, '""') + '"';

// URL scheme allowlist: http(s), mailto, tel, or relative/anchor; else neutralize to "#".
const safeUrl = u => {
  u = (u == null ? "" : String(u)).trim();
  return /^(https?:|mailto:|tel:|\/|#|\.)/i.test(u) ? u : "#";
};

// HTML entity escaper (use before writing ANY dynamic value into markup or an attribute).
const esc = s => (s == null ? "" : String(s)).replace(/[&<>"']/g,
  c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
```

**Usage:**
```js
// Building a CSV row
let csv = "Name,Email,Role\n";
rows.forEach(r => csv += [r.name, r.email, r.role].map(csvCell).join(",") + "\n");

// Rendering a user-supplied link safely (escape + allowlist + noopener)
`<a href="${esc(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer">${esc(link.label)}</a>`
```
