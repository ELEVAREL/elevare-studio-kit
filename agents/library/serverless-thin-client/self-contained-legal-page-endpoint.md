# Self-contained, edge-cached Privacy/ToS page as a zero-dep serverless route

**When to reach for it:** a no-framework / static-client product that needs a real Privacy Policy + Terms of Service surface but has no CMS, no `/pages` router, and no HTML-serving story. Serve the whole legal page from **one serverless function that returns a self-contained HTML string** — inline `<style>`, no external assets, styled in the app's own palette so it doesn't look like a bolted-on boilerplate — and cache it hard at the edge so it costs ~zero bandwidth after the first hit. A `/legal` command or footer link opens it; it doubles as the canonical URL for signup / Stripe / marketing footers.

**Origin:** asky (`api/legal.js` — terminal-styled, dark-palette, edge-cached). De-branded; operator/contact parameterized.

---

## `api/legal.js` — the shape

```js
// GET /api/legal — Privacy & Terms as a self-contained, themed HTML page.
// No deps, no external assets, cached at the edge. Source of truth for the WORDING
// lives in /LEGAL.md — keep the two in sync when terms change.
const EFFECTIVE = "2026-07-15";
const OPERATOR  = process.env.LEGAL_OPERATOR  || "Example Studio LLC";   // parameterize
const CONTACT   = process.env.LEGAL_CONTACT   || "legal@example.com";    // [confirm before promoting]

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="robots" content="index,follow">
<link rel="icon" href="data:,">
<title>Privacy &amp; Terms</title>
<style>
  /* Pull these tokens straight from the app's own :root so the page matches the product. */
  :root{--bg:#0b0b0c;--ink:#e7e2d6;--dim:#7d776b;--amber:#e8b341;--red:#e06a5a;--blue:#6fb3d1;--line:#1c1c1d}
  *{box-sizing:border-box} html,body{margin:0}
  body{background:var(--bg);color:var(--ink);font:15px/1.6 ui-monospace,Menlo,Consolas,monospace;
    padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
  .wrap{max-width:760px;margin:0 auto;padding:22px 16px 64px}
  a{color:var(--blue);text-decoration:none} a:hover{text-decoration:underline}
  h1{color:var(--amber);font-size:18px;margin:26px 0 6px} h2{color:var(--amber);font-size:15px;margin:22px 0 4px}
  .note{border:1px solid var(--amber);border-radius:6px;padding:12px 14px;margin:14px 0;background:#16130a}
  .note b{color:var(--amber)} .dim{color:var(--dim)}
  .tblwrap{overflow-x:auto} table{border-collapse:collapse;font-size:13px;min-width:520px}
  th,td{border:1px solid var(--line);padding:5px 9px;text-align:left;vertical-align:top}
</style>
</head>
<body><div class="wrap">
  <p class="dim">Effective ${EFFECTIVE} · Operator: ${OPERATOR} · Contact: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
  <div class="note"><b>This is not legal advice.</b> A working template prepared by ${OPERATOR}, not a
    substitute for a licensed attorney. Have a qualified attorney review and finalize before relying on it.</div>

  <h1>Summary</h1>
  <!-- Part A — Privacy (what you collect, why, retention, sharing, rights, cookies/localStorage) -->
  <!-- Part B — Terms (eligibility, acceptable use, payments/refunds, disclaimers, liability, changes) -->
  <!-- Part C — Cookies & local storage -->
  <footer class="dim">Prepared by ${OPERATOR}. <b>Not legal advice.</b> Full source of truth: /LEGAL.md</footer>
</div></body></html>`;

module.exports = (req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Cache hard at the edge — terms rarely change, so this page costs ~zero bandwidth.
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
  res.end(PAGE);
};
```

---

## Why this shape

- **Self-contained** — inline CSS, `<link rel="icon" href="data:,">` (no favicon request), no fonts/scripts/images. One request, renders anywhere, works offline once cached, no CSP headaches. Fits the "network-quiet" product ethos.
- **Themed in the app palette** — pull the tokens verbatim from the product's own `:root` so the legal page reads as part of the product, not a generic template. (Same "match the canonical token source, don't re-derive" rule the studio applies to every surface.)
- **Edge-cached** — `s-maxage=86400` means the CDN serves it; the function runs roughly once a day per region. Cheapest possible way to host a rarely-changing page.
- **Honest framing baked in** — a prominent **"This is not legal advice"** note at top and in the footer, an `Effective` date, and a pointer to `/LEGAL.md` as the canonical wording. The template is a starting point a lawyer finalizes, and it says so.

## Load-bearing details

1. **Keep the rendered page and a `/LEGAL.md` in sync.** Ship the full wording in a repo `LEGAL.md` as the source of truth and mirror it into the page; when terms change, edit both. Naming the canonical file stops the served page from drifting into an un-reviewed fork.
2. **"Not legal advice" is non-negotiable** on any studio-generated legal surface (this is compliance-counsel's standing rule: these are templates, not certified compliance). Mark placeholder governing-law / contact / entity fields clearly (`[confirm]`) so nobody ships a template as if a lawyer signed off.
3. **`robots: index,follow`** — you *want* this page indexed (it's the canonical policy URL linked from checkout, signup, footer). Don't `noindex` it.
4. **Escape any interpolated dynamic value.** Operator/contact here are trusted env/consts; if you ever interpolate user or client-supplied text into the HTML string, escape `& < > " '` first (a stray `"` breaks an attribute; a `<script>` is stored XSS). Prefer static consts.
5. **The `s-maxage` means a wording change won't appear instantly** — bump/purge the CDN cache (or lower `s-maxage` around a known change) when you actually update terms.

## Assumes / adapt

- **Plain Node serverless** (`module.exports = (req,res)`). On Next.js this is a static route or an MDX page instead — reach for a CMS/route there; this pattern is specifically for the no-framework product that has nowhere else to put an HTML page.
- **Content is a template, not vetted law.** The value here is the *delivery mechanism* (self-contained, themed, cached, honestly framed) — the actual clauses must be reviewed for the jurisdiction and business. Route the wording through **compliance-counsel** and a real attorney before promoting the product as compliant.
- **Parameterize the branding** (`LEGAL_OPERATOR`, `LEGAL_CONTACT`, `EFFECTIVE`, palette tokens) so the same route drops into any product by changing a few consts/env vars.
- **Extends to any rarely-changing self-contained page** — an About, a status/"how it works", a pricing explainer — same self-contained + edge-cached + themed recipe. It's the cheap-static-HTML-from-a-function pattern; legal is just the highest-value instance.
- For the **checkout-time clickwrap / consent** side of compliance (accept-terms checkbox, best-effort logging that never blocks a sale), that's a separate concern — see studio memory [[elevare-legal-terms]]. This file is only the hosted policy page.
