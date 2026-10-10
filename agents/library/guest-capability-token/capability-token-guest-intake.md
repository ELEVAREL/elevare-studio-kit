# Capability-token guest intake

A zero-friction, **no-auth** post-purchase (or post-event) intake, keyed by an
**unguessable capability token**, for an app whose owning table is user/admin-only
under RLS. The buyer — **guest OR signed-in** — opens `/<flow>/intake/[token]`,
submits their inputs without ever logging in, and the route reads/writes the
locked row via the **service-role** client, gated **solely** by the token.

The token is a bearer capability: whoever holds it may fill in exactly this one
order and nothing else. It is minted server-side at fulfillment time, delivered
by email, and is the only access key — so it must be **random, never a
sequential id**.

Harvested from Elevare Studio's Scroll-Stopper Ads feature
(`src/lib/fulfillment.ts` → `fulfillAds`, `src/app/api/ads-intake/[token]/route.ts`,
`src/app/ads/intake/[token]/intake-form.tsx`). Generalized here — swap `ads` for
your flow noun (`intake`, `brief`, `onboarding`, `booking-details`, `rsvp`, …).

---

## When to reach for it

Reach for this whenever a **guest** must supply information *after* a
transaction, against a row your RLS deliberately hides from anonymous users:

- Post-purchase brand/asset intake (logo, colors, one sentence) before you can
  fulfill a service order.
- "We need X before we can build/ship" — GitHub username for a repo invite,
  measurements, a design brief, delivery address, a scheduling preference.
- Any "click the link in your email and fill this in" flow where **forcing a
  signup would cost you the conversion**, but the underlying table is
  user/admin-only.
- Guest-checkout products where there is **no `user_id`** to hang RLS off of —
  the token *is* the identity for this one action.

Do **not** reach for it when the actor is already authenticated for that resource
(just use RLS + their session), or when the data is public anyway (use a normal
public read). This pattern's whole reason to exist is: *the row is locked, the
actor has no session, and you still need exactly-scoped write access.*

**Cross-links:**
- The RLS posture this pattern lives inside → `supabase-nextjs-pwa/service-role-free-supabase-security.md`
  and `ecommerce-supabase-stripe/no-service-role-order-rpc.md` (random-id / capability-scoped access, never sequential).
- This is the **guest-read/write** cousin of the token-gated *pay* pages in
  `ecommerce-supabase-stripe/quote-to-order-flow.md` and
  `stripe-connect/quote-to-pay-connect-feesplit.md` (those gate a public **payment**
  page by an unguessable token; this gates a public **intake** page the same way).
- The fulfillment webhook that mints the token → `buy-once-fulfillment/stripe-buyonce-fulfillment.md`.
- The email that carries the link → `ecommerce-supabase-stripe/branded-transactional-email-shell.md`.
- SVG upload sanitizing → `offline-native-app/html-sanitizer-allowlist.md` (same allowlist idea, server side).

---

## The shape (three files)

```
lib/fulfillment.ts                      # 1. MINT token on paid order, email the link
app/api/<flow>-intake/[token]/route.ts  # 2. GET summary / POST save  (service-role, token-gated)
app/<flow>/intake/[token]/intake-form.tsx  # 3. guest-capable client form (5 phases)
```

### 1. Mint the token at fulfillment time

On the paid order, mint a capability token into the order's `fulfillment_notes`
JSONB, mark it `awaiting_info`, and email both owner and buyer a link. **Never
throws** — a notification failure must not fail the webhook (Stripe would retry
and duplicate the order).

```ts
import crypto from "node:crypto";

async function fulfillIntake(supabase, { orderId, productId }) {
  // 32 bytes hex = 64 lowercase hex chars = 256 bits. Unguessable, single-purpose.
  const intakeToken = crypto.randomBytes(32).toString("hex");

  await supabase.from("orders").update({
    fulfillment_status: "awaiting_info",
    fulfillment_notes: { kind: "ads", need: "ads_intake", intake_token: intakeToken,
                         at: new Date().toISOString() },
  }).eq("id", orderId);

  // Best-effort emails — wrapped so a send error can't fail fulfillment.
  try {
    // owner alert → /admin/orders ; buyer nudge → /<flow>/intake/${intakeToken}
  } catch { /* notification failures never fail fulfillment */ }
}
```

### 2. The token-gated route (service-role, GET summary + POST save)

```ts
export const runtime = "nodejs";        // SVG sanitizer pulls in jsdom → not Edge-safe
export const dynamic = "force-dynamic";

function service() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!   // service-role: RLS is bypassed, so the
  );                                         // TOKEN is the entire access boundary
}

// Format-gate BEFORE any query. A token is 32 bytes hex — reject anything else
// so probing (sql-ish input, short strings, uuids) never reaches the DB.
function validToken(t: string): boolean {
  return /^[0-9a-f]{64}$/.test(t);
}

// Match SOLELY on the token, via a parameterized PostgREST .filter on the JSONB path.
async function findOrderByToken(supabase, token: string) {
  const { data } = await supabase
    .from("orders")
    .select("id, product_id, fulfillment_status, fulfillment_notes")
    .filter("fulfillment_notes->>intake_token", "eq", token)
    .maybeSingle();
  return data;
}

// GET → minimal, NON-sensitive summary (enough to render the form; never the
//        buyer's email, amount, other orders, or the token itself).
export async function GET(_req, { params }) {
  const { token } = await params;
  if (!validToken(token)) return json({ error: "Invalid link" }, 404);
  const order = await findOrderByToken(service(), token);
  if (!order) return json({ error: "Order not found" }, 404);
  const notes = order.fulfillment_notes ?? {};
  return json({
    productName: /* product.name */,
    alreadySubmitted: Boolean(notes.ads_intake),   // idempotent re-open → "already" phase
  });
}

// POST → validate, optional file upload, write ONLY this order's payload.
export async function POST(request, { params }) {
  const { token } = await params;
  if (!validToken(token)) return json({ error: "Invalid link" }, 404);

  // Unauthenticated write → rate-limit by IP (spam/abuse guard).
  const rl = await rateLimit({ key: "ads-intake", identifier: getClientIp(request),
                               limit: 20, windowSeconds: 60 });
  if (!rl.ok) return rateLimitResponse(rl);

  const body = await request.json();          // (wrap in try/catch → 400)
  // ...trim + validate fields; cap lengths so a submit can't bloat the JSONB column...

  const supabase = service();
  const order = await findOrderByToken(supabase, token);   // re-resolve server-side
  if (!order) return json({ error: "Order not found" }, 404);
  const notes = order.fulfillment_notes ?? {};

  // ── Optional logo upload → PRIVATE bucket ───────────────────────────────
  let logoPath = null;
  if (body.logoDataUrl) {
    const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(body.logoDataUrl);
    if (!m) return json({ error: "Not a valid image." }, 400);
    const mime = m[1].toLowerCase();
    if (!LOGO_MIME.has(mime)) return json({ error: "PNG, JPG, SVG, or WebP." }, 400);
    let buffer = Buffer.from(m[2], "base64");
    if (!buffer.byteLength || buffer.byteLength > MAX_LOGO_BYTES)
      return json({ error: "Under 5 MB." }, 400);

    if (mime === "image/svg+xml") {
      // LAZY dynamic import — see invariant #5. jsdom/dompurify must NOT be
      // static-imported into a serverless route (ERR_REQUIRE_ESM at module eval).
      const { sanitizeSvg } = await import("@/lib/sanitize-svg");
      const { svg, ok } = sanitizeSvg(buffer.toString("utf-8"));
      if (!ok || !svg) return json({ error: "SVG couldn't be processed safely." }, 400);
      buffer = Buffer.from(svg, "utf-8");
    }
    // Path derived from the SERVER-TRUSTED order id, NEVER the client filename —
    // a crafted name can't traverse or overwrite another order's object.
    logoPath = `ads-intake/${order.id}/logo.${LOGO_EXT[mime]}`;
    const { error: upErr } = await supabase.storage.from("deliveries")
      .upload(logoPath, buffer, {
        contentType: mime, upsert: true,
        // Defense in depth: force download so an svg can't render inline in the
        // viewer's origin even if someone opens the signed URL directly.
        ...(mime === "image/svg+xml"
          ? { headers: { "content-disposition": "attachment" } } : {}),
      });
    if (upErr) return json({ error: "Could not save your logo." }, 500);
  }

  // Write ONLY this order's row, merging (not replacing) fulfillment_notes.
  const { error } = await supabase.from("orders").update({
    fulfillment_status: "in_progress",
    fulfillment_notes: { ...notes, ads_intake: {
      business_sentence: businessSentence, brand_colors: brandColors || null,
      contact_email: contactEmail || null, logo_path: logoPath,
      submitted_at: new Date().toISOString() } },
  }).eq("id", order.id);          // .eq(id) → cross-order write isolation
  if (error) return json({ error: "Could not save your info." }, 500);

  // Owner notification with the completed brief — best-effort, never fail the buyer.
  return json({ ok: true });
}
```

### 3. The guest-capable form (5 phases)

Client component takes only `{ token }`. On mount it `GET`s the summary and
routes to one of five phases; no auth, no session read.

```
loading   → spinner while GET resolves
invalid   → 404 body ("this link is invalid or expired" — reply for a fresh one)
already   → GET said alreadySubmitted → "we've got your details" (idempotent re-open)
form      → the 3-field form; file → FileReader.readAsDataURL → base64 data URI in POST body
done      → post-submit thank-you
```

Client-side file handling: validate type + size **client-side too** (fast UX),
then `FileReader.readAsDataURL(file)` → a `data:<mime>;base64,...` URI sent as a
JSON string in the POST body. (The server re-validates everything — client checks
are UX, not security.)

---

## Security invariants (the load-bearing rules — do not drop any)

1. **Random token, never a sequential id.** `crypto.randomBytes(32).toString("hex")`
   = 256 bits. The token is the *entire* access boundary once you use the
   service-role client, so it must be unguessable and un-enumerable. A row id,
   order number, or short code would let anyone walk other people's orders.

2. **Service-role + token-only gate — and nothing else.** The route uses the
   service-role client precisely because RLS hides the row from anon. That means
   **RLS is off for this query** — the token match *is* the authorization. Match
   **solely** on the token (`fulfillment_notes->>intake_token = $token`) via a
   parameterized `.filter`. Never widen the query with client-supplied ids.

3. **Format-gate before the query.** `validToken()` enforces `^[0-9a-f]{64}$`
   before anything touches the DB — cheap defense against probing and malformed
   input, and it keeps the DB query shape fixed.

4. **Server-trusted storage path.** Any uploaded file goes to a **private**
   bucket at a path derived from the **server-resolved** `order.id`
   (`ads-intake/${order.id}/logo.<ext>`) — **never** the client-supplied
   filename. A crafted name (`../other-order/logo.png`) then can't traverse into
   or overwrite another order's object.

5. **Lazy-load heavy/ESM-only deps OFF the serverless module scope.** The SVG
   sanitizer chain (`isomorphic-dompurify` → `jsdom` → `html-encoding-sniffer`)
   has CJS/ESM interop that **crashes the serverless module at top-level eval**
   on Vercel (`ERR_REQUIRE_ESM`). Import it **dynamically inside the SVG branch**
   (`await import(...)`) so it loads only when an SVG is actually uploaded — off
   the hot path, off the bad-token/no-logo paths entirely. Set
   `export const runtime = "nodejs"` (jsdom is not Edge-compatible).

6. **Cross-order write isolation.** The write is `update(...).eq("id", order.id)`
   where `order.id` came from the **token lookup**, and `fulfillment_notes` is
   **merged** (`{ ...notes, ads_intake: {...} }`), not replaced — so a submission
   can only ever touch the one order the token resolved to, and can't clobber
   sibling keys in that order's notes.

7. **Sanitize active-document uploads (SVG).** An SVG is executable markup: a
   poisoned `<svg>` with `<script>`/`onload`/`javascript:` href becomes stored
   XSS the moment the owner opens its signed URL inline. Run every SVG through an
   allowlist sanitizer, **reject** if it can't be made safe, and additionally
   serve it `content-disposition: attachment`. Raster formats (png/jpg/webp) are
   inert and pass through.

8. **Rate-limit the unauthenticated POST by IP.** No session means no per-user
   throttle — gate abuse with an IP rate-limit (e.g. 20/min).

9. **Length-cap every stored field.** Cap the text fields (e.g. 500/600 chars)
   and the file (5 MB) so a submission can't be used to bloat the JSONB column /
   storage.

10. **Idempotent re-open.** GET reports `alreadySubmitted` (presence of the
    payload key) so re-clicking the email link shows "we've got your details"
    instead of a second write. Optionally hard-block a second POST the same way.

11. **GET returns only non-sensitive fields.** Product name / tagline / a
    submitted-flag — never the buyer email, amount, other orders, or the token.

---

## DB shape

No new table. The token and payload both live on the existing owning row's
JSONB `fulfillment_notes` (works for any Postgres/Supabase table with a JSONB
column — `orders`, `bookings`, `jobs`, …):

```jsonc
// orders.fulfillment_notes  (jsonb)
{
  "kind": "ads",
  "need": "ads_intake",
  "intake_token": "9f3c…64 lowercase hex chars…",   // ← the capability (minted at fulfillment)
  "at": "2026-07-03T…",
  // ── added on POST ──
  "ads_intake": {                                    // ← presence = alreadySubmitted
    "business_sentence": "…",
    "brand_colors": "#1D8C5A, gold" ,
    "contact_email": "you@example.com",
    "logo_path": "ads-intake/<order-id>/logo.svg",   // path into the PRIVATE bucket, or null
    "submitted_at": "2026-07-03T…"
  }
}
```

Index tip: if intake lookups get hot, add a functional/GIN index so
`fulfillment_notes->>'intake_token'` resolves without a scan, e.g.
`CREATE INDEX ON orders ((fulfillment_notes->>'intake_token'));`.

Uploads live in a **private** Storage bucket (`deliveries`), read later by the
owner via short-lived signed URLs (see `buy-once-fulfillment/stripe-buyonce-fulfillment.md`
for the signed-URL discipline).

---

## Request / response contract (pin this on the seam)

```
GET  /api/<flow>-intake/[token]
  200 → { productName: string, tagline: string|null, alreadySubmitted: boolean }
  404 → { error }         // invalid token FORMAT or no matching order (same status → no oracle)

POST /api/<flow>-intake/[token]
  body → { businessSentence: string (required, 3..600),
           brandColors?: string (..500),
           contactEmail?: string,
           logoDataUrl?: string,   // "data:<mime>;base64,…", png/jpg/svg/webp, ≤5MB
           logoName?:   string }
  200 → { ok: true }
  400 → { error }   // bad json / validation / bad image / SVG unsafe
  404 → { error }   // bad token format or no matching order
  429 → { error }   // IP rate-limited
  500 → { error }   // upload or DB write failed
```

Note the deliberate **404-for-both** (bad format and no-match) so the endpoint is
not an existence oracle.

---

## Assumes / adapt

- **Assumes** Next.js App Router route handlers with `params: Promise<{token}>`
  (`await params`), a Supabase service-role key available server-side, a JSONB
  notes column on the owning row, and a private Storage bucket for uploads.
  Adapt the client/framework freely — the invariants are framework-agnostic.
- **Assumes** the token was already minted upstream (at Stripe fulfillment).
  If your trigger isn't a purchase (event RSVP, admin-issued link), mint the
  token wherever that row is created and email it the same way.
- **`.filter("json->>key","eq",token)`** is the Supabase/PostgREST way to match a
  JSONB path; on raw Postgres it's `where notes->>'intake_token' = $1`. Keep it
  **parameterized** — never string-concatenate the token in.
- **Drop the upload entirely** if your intake is text-only — then you can remove
  invariants 4, 5, 7 and the `nodejs` runtime pin, and the route can stay tiny.
- **No service-role key?** If your app follows the studio's no-`service_role`
  stance, replace the service-role read/write with a pair of **SECURITY DEFINER
  RPCs** that take the token as an argument and enforce the same
  `notes->>intake_token = token` match internally (a `get_intake_summary(token)`
  and a `save_intake(token, payload)`), granting them to `anon`. Same capability
  model, DB-enforced. See `supabase-nextjs-pwa/service-role-free-supabase-security.md`.
- **Token rotation / expiry**: this token doesn't expire (a buyer might complete
  intake days later). If you need expiry, store a `token_expires_at` alongside it
  and check it in `findOrderByToken`; on expiry, offer a "send me a fresh link"
  path (the `invalid` phase copy already hints at replying for a new one).
