# Email a deliverable package via Resend (base64 attachments, size-guarded)

**When to reach for it:** you've produced a set of files (print PNGs/PDFs, an MP4, a PDF proof, a zipped asset pack) and need to **hand them to a specific recipient by email** — a newspaper's ad-placement editor, a client for sign-off, a print vendor. Not a marketing blast; a one-to-one delivery with the files attached and a short human note. Resend sends it from a verified studio domain so it lands, not spam.

**Assumes / adapt:**
- **Verified sending domain.** `from` must be on a Resend-verified domain — the studio's is `mail.elevarestudio.co` (`EMAIL_FROM` / `RESEND_API_KEY` live in the [[keyvault]]). Format the display name to make the sender obvious and trustworthy: `"The Traway Home via Elevare Studio <hello@mail.elevarestudio.co>"`. `cc` yourself so you have a record and can confirm it sent.
- **Attachments are base64 in the JSON body.** Read each file, `buf.toString("base64")`, push `{ filename, content }`. Rename files to something the recipient understands (`Traway-Home_Ad_V1_Join-Our-Family.png`, not `v1.png`) — the source basename is for you, the attachment name is for them.
- **Guard the payload size — Resend's hard limit is ~40 MB for the whole request.** Sum raw bytes as you attach and **abort before sending** if total > ~38 MB (base64 inflates ~33%, so keep raw margin). If you blow the limit: drop the video to a link, or split into two emails. The Traway package (6 print files + a 13 MB MP4) fits; a longer/4K video won't.
- **Skip-and-warn on a missing file** rather than crashing — `try/readFileSync/catch → console.error("MISSING (skipped)")` — so one absent artifact doesn't kill the whole send, and you see exactly what's missing.
- **The email body is a short, human, specific note** — inline-styled HTML in the brand serif/colors, one paragraph of what's attached and why, a bulleted list of the variants with a one-line pitch each, and (critical for print) an explicit **"please confirm the phone number and address are correct before it prints"** line. No AI tells, no em-dashes (studio copy rule). Sign on behalf of the client.
- **Check the response.** `POST https://api.resend.com/emails` → log `HTTP <status>` + the JSON; non-2xx `process.exit(3)` so a failed send is loud, not silent.
- **Also ship the Desktop gallery** for one-glance preview + download (the studio marketing staple, `build-gallery.mjs` → self-contained base64 HTML on the Desktop) — see memory `marketing-asset-gallery-staple`. The email is for the recipient; the gallery is for the client/owner to eyeball everything at once.
- **Reference implementation:** `D:\TrawayHome\ad\send.mjs`.

## Skeleton

```js
import { readFileSync } from "node:fs";
const KEY = process.env.RESEND_API_KEY;
if (!KEY) { console.error("Missing RESEND_API_KEY"); process.exit(1); }

const FROM = "Client Name via Elevare Studio <hello@mail.elevarestudio.co>";
const TO = ["recipient@example.com"];
const CC = ["<owner-personal-email>"];              // your record
const files = [
  ["v1-join-our-family.png", "Client_Ad_V1.png"],
  ["video/out/spot.mp4",     "Client_Spot_30s.mp4"],
];

const attachments = []; let total = 0;
for (const [path, filename] of files) {
  try { const buf = readFileSync(path); total += buf.length;
        attachments.push({ filename, content: buf.toString("base64") }); }
  catch { console.error("MISSING (skipped):", path); }
}
console.log("Attachments:", attachments.length, "| MB:", (total / 1048576).toFixed(2));
if (total > 38 * 1048576) { console.error("Payload >38MB — aborting"); process.exit(2); }

const html = `<div style="font-family:Georgia,serif;font-size:15px;color:#26303F;line-height:1.55;max-width:600px">
  <p>Hi …,</p><p>Here is the … print-ready at <strong>300 DPI</strong>, PNG + PDF.</p>
  <p>Please confirm the phone number and address are correct before it prints.</p></div>`;

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: FROM, to: TO, cc: CC, subject: "…", html, attachments }),
});
console.log("HTTP", res.status, JSON.stringify(await res.json()));
if (!res.ok) process.exit(3);
```

## Cross-references
- The files this sends come from [`html-to-300dpi-print-ad.md`](html-to-300dpi-print-ad.md) + [`remotion-mp4-ad-pipeline.md`](remotion-mp4-ad-pipeline.md).
- General transactional-email shell for apps: [`../ecommerce-supabase-stripe/branded-transactional-email-shell.md`](../ecommerce-supabase-stripe/branded-transactional-email-shell.md).
- Desktop preview gallery: memory `marketing-asset-gallery-staple`.
