# Branded transactional email shell (Resend, escaped)

**What it is.** One `shell(title, bodyHtml)` wrapper + one `esc()` escaper that back every transactional email in an app — order confirmation, shipped, receipt, quote, custom-request receipt, and owner alerts — so they all share the brand and no dynamic value can inject markup. All inline-styled (email clients strip `<style>`), table-based rows, single accent button.

**When to reach for it.** Any app that sends more than one type of transactional email via Resend (or any raw-HTML email API). Instead of hand-building each message, you get a consistent branded frame + XSS-safe interpolation in ~40 lines.

## The two primitives

```ts
/** Escape ALL user-supplied text before it touches email HTML. */
function esc(input: unknown): string {
  return String(input ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

/** Branded shell — header eyebrow + serif title, body slot, dashed footer, studio credit. */
function shell(title: string, bodyHtml: string): string {
  return `
  <div style="margin:0;padding:24px;background:#F4ECDD">
    <div style="max-width:560px;margin:0 auto;background:#FBF6EC;border:1px solid #E7DCC9;border-radius:16px;overflow:hidden">
      <div style="padding:30px 32px 6px;text-align:center">
        <div style="font-family:Arial,sans-serif;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#6E6357">BRAND · TAGLINE</div>
        <h1 style="font-family:Georgia,serif;font-size:26px;color:#2B2622;margin:12px 0 0">${esc(title)}</h1>
      </div>
      <div style="padding:18px 32px 8px;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:#2B2622">${bodyHtml}</div>
      <div style="border-top:1px dashed #D8C9B0;margin-top:18px;padding:16px 32px;text-align:center;font-family:Georgia,serif;color:#6E6357;font-size:14px">FOOTER LINE.</div>
    </div>
    <p style="max-width:560px;margin:12px auto 0;text-align:center;font-size:11px;color:#8A7E6F">Powered by Elevare Studio LLC</p>
  </div>`;
}
```

## The reusable helpers on top
- `itemRows(items)` → escaped `<tr>` per line with right-aligned money (table layout, `align="right"` attribute for Outlook).
- A single `send({ to, subject, html, replyTo? })` wrapper that no-ops if `RESEND_API_KEY` is unset and `try/catch`-logs failures (an email hiccup must never throw into the webhook).
- Accent **button** = an inline-styled `<a>` (never a `<button>`), always followed by the raw URL as copy-pasteable text: `Or paste this link: <span>${esc(url)}</span>` — for clients that strip links.
- Each message type is a thin function: `sendOrderConfirmation`, `sendOrderShipped`, `sendQuote`, `sendCustomRequestReceipt`, `sendContactReceipt`, `sendAdminOrderAlert`, `sendCustomRequestAlert` — each builds a `body` and calls `shell()`.

## Assumes / adapt
- **Escape EVERYTHING dynamic** — names, notes, categories, order numbers, URLs (including inside `href` and copy-paste spans). A stray `"` in a value otherwise breaks the markup and is an injection vector.
- **Inline styles only.** Email clients strip `<head>`/`<style>`. Use tables + `align` attributes for anything that must survive Outlook.
- **Never throw from send.** No API key → silent no-op; send error → log, don't rethrow (best-effort, wrapped in `Promise.allSettled` at the call site so one failed email doesn't fail the webhook).
- **Owner alerts set `replyTo` to the customer** so the owner can reply straight to them.
- `FROM` must be a Resend-verified sender/domain or all mail silently no-ops. Swap the palette hexes + BRAND/TAGLINE/FOOTER to re-skin; keep the credit line if it's a studio deliverable.
- Keep the one-off provisioning invite email (see `magic-link-admin-onboarding.md`) visually in sync with this shell.
