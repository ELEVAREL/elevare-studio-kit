# In-app embedded Stripe checkout for a no-framework client (plain Node serverless + vanilla JS)

**When to reach for it:** you need to take a card payment **in-app** (no off-site redirect) from a **static HTML / vanilla-JS client** with **plain Node serverless functions** (`module.exports = (req,res)`) — no Next.js, no React, no `@stripe/react-stripe-js`, no build step. Stripe Embedded Checkout runs the card fields in its own PCI-safe iframe, which you mount inside your own themed panel by lazily loading `Stripe.js` from a `<script>` at click time. Fulfillment is a signature-verified, idempotent webhook — the redirect is never trusted.

This is the **raw-Node + vanilla-client** flavor of the studio's embedded-checkout patterns. For Next.js/React use `ecommerce-supabase-stripe/embedded-stripe-checkout-nextjs.md` (App Router, `<EmbeddedCheckout>`); for the studio's default **themed Payment Element** use `ecommerce-supabase-stripe/themed-inapp-payments.md`. Reach here specifically when there is **no framework** to lean on and you want the smallest possible surface.

**Origin:** asky (`api/buy.js` + `api/stripe-webhook.js` + the vanilla lazy Stripe.js loader). De-branded.

---

## `api/buy.js` — start the checkout (session-authed)

```js
const Stripe = require("stripe");
const S = require("../lib/store");

module.exports = async (req, res) => {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") { res.statusCode = 405; res.end(JSON.stringify({ error: "Use POST" })); return; }

  const sess = S.verifySession((req.headers["x-my-token"] || "").trim());
  if (!sess) { res.statusCode = 401; res.end(JSON.stringify({ error: "signin" })); return; }
  const user = await S.getUserById(sess.uid).catch(() => null);
  if (!user) { res.statusCode = 401; res.end(JSON.stringify({ error: "signin" })); return; }

  const secret = (process.env.STRIPE_SECRET_KEY || "").trim();
  const pk = (process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
  if (!secret || !pk) { res.statusCode = 500; res.end(JSON.stringify({ error: "payments not configured" })); return; }

  let body = {}; try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); } catch (_) {}
  const pack = S.PACKS[body.pack];                         // price + credits from CODE, not a Stripe Product
  if (!pack) { res.statusCode = 400; res.end(JSON.stringify({ error: "unknown pack" })); return; }

  try {
    const stripe = Stripe(secret);                         // pin/verify apiVersion supports embedded checkout
    const session = await stripe.checkout.sessions.create({
      ui_mode: "embedded",
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: pack.cents,
        product_data: { name: `${pack.credits.toLocaleString()} credits` } } }],
      metadata: { uid: user.id, credits: String(pack.credits), pack: body.pack },  // webhook reads these
      redirect_on_completion: "never",
      // ⚠️ DO NOT set customer_email to a possibly-empty value — see gotcha #1.
    });
    res.end(JSON.stringify({ clientSecret: session.client_secret, publishableKey: pk }));
  } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: "could not start checkout: " + (e.message || e) })); }
};
```

## `api/stripe-webhook.js` — fulfillment ship-of-truth (raw body, idempotent, amount-checked)

```js
const Stripe = require("stripe");
const S = require("../lib/store");

// Vercel/serverless parse JSON by default; Stripe signature verification needs the
// UNMODIFIED raw bytes, so buffer them ourselves and disable the body parser (below).
function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.statusCode = 405; res.end("Use POST"); return; }
  const secret = (process.env.STRIPE_SECRET_KEY || "").trim();
  const whsec = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
  if (!secret || !whsec) { res.statusCode = 500; res.end("stripe not configured"); return; }

  const stripe = Stripe(secret);
  let event;
  try {
    const buf = await rawBody(req);
    event = stripe.webhooks.constructEvent(buf, req.headers["stripe-signature"], whsec);
  } catch (e) { res.statusCode = 400; res.end("bad signature: " + (e.message || e)); return; }

  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object;
      const uid = s.metadata && s.metadata.uid;
      const credits = parseInt((s.metadata && s.metadata.credits) || "0", 10);
      // Defense-in-depth: the amount ACTUALLY PAID must match the pack's known price
      // and credit count — never trust a client-supplied amount, and guard future bugs.
      const P = s.metadata && S.PACKS[s.metadata.pack];
      const amountOk = !P || (s.amount_total === P.cents && credits === P.credits);
      if (uid && credits > 0 && s.payment_status === "paid" && amountOk) {
        await S.grant(uid, credits, "purchase", s.id);     // idempotent on UNIQUE stripe_id = session id
      }
    }
  } catch (e) {
    // Return 500 -> Stripe retries. The grant is idempotent, so a retry can't double-credit.
    res.statusCode = 500; res.end("handler error"); return;
  }
  res.statusCode = 200; res.end(JSON.stringify({ received: true }));
};

// THE gotcha that breaks signature verification if omitted: give us the raw body.
module.exports.config = { api: { bodyParser: false } };
```

## Vanilla client — lazy-load Stripe.js at click time, mount the embedded iframe

No npm Stripe package on the client. Load the script once, on demand, so it never costs the initial page load:

```js
let _stripeJs;
function loadStripeJs() {
  if (_stripeJs) return _stripeJs;
  _stripeJs = new Promise((resolve, reject) => {
    if (window.Stripe) return resolve();
    const el = document.createElement("script");
    el.src = "https://js.stripe.com/v3/";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("could not load Stripe.js"));
    document.head.appendChild(el);
  });
  return _stripeJs;
}

async function openBuy(pack, mountEl) {
  const r = await fetch("/api/buy", { method: "POST",
    headers: { "content-type": "application/json", "x-my-token": localStorage.getItem("token") || "" },
    body: JSON.stringify({ pack }) });
  const { clientSecret, publishableKey, error } = await r.json();
  if (error) throw new Error(error);
  await loadStripeJs();
  const stripe = window.Stripe(publishableKey);
  const checkout = await stripe.initEmbeddedCheckout({ clientSecret });
  checkout.mount(mountEl);                 // renders Stripe's iframe inside YOUR themed panel
}
```

After payment, poll your own server for the granted balance (the webhook is what actually credits — see reliability note) rather than trusting the client-side "complete" event.

---

## The gotchas (each one cost real debugging on asky or is in studio memory)

1. **Never pass a null/empty `customer_email`.** Username-auth accounts have no email; passing `customer_email: ""` (or `null`) makes Stripe reject the session — this was a **502 on every purchase**. Omit the field entirely; Embedded Checkout collects the email in its own iframe. (Only set `customer_email` when you actually have a valid one.)
2. **`module.exports.config = { api: { bodyParser: false } }` is mandatory on the webhook.** Any body parsing mutates the bytes and `constructEvent` fails signature verification → every webhook 400s → **customers pay but never get credited** (the most likely silent revenue bug). Buffer the raw body yourself.
3. **The webhook is the only fulfillment path — never the redirect.** `redirect_on_completion: "never"`; grant on `checkout.session.completed` with `payment_status === "paid"`. A shared/guessable success URL is a double-grant vector.
4. **Re-verify the amount server-side.** `s.amount_total === P.cents && credits === P.credits` against the price the server itself set (from `PACKS` in code). Client metadata is untrusted input.
5. **Idempotent grant, safe 500s.** Because the grant is UNIQUE on the Checkout Session id (see `atomic-metered-credits.md`), returning 500 on a transient error is safe — Stripe retries and the grant runs exactly once.
6. **Pin/verify the Stripe `apiVersion`.** Some stripe-node major versions changed the default that supports embedded Checkout (studio memory: [[stripe-embedded-uimode-apiversion]] — a 22.x default dropped embedded and 400'd). Confirm the version you install supports `ui_mode:"embedded"`.
7. **Vercel stores env values literally.** A `STRIPE_SECRET_KEY="rk_live_..."` with quotes keeps the quotes and breaks at runtime; paste raw, and `.trim()` on read.

## Assumes / adapt

- **Assumes the serverless auth + credits spine** (`username-password-serverless-auth.md` for the session gate and `getUserById`; `atomic-metered-credits.md` for `S.grant` and `PACKS`). If you sell a one-time artifact instead of topping up a balance, swap the grant for a license/download mint and use `buy-once-fulfillment/stripe-buyonce-fulfillment.md` (email-sent stamp + recovery poller + insert-race handler — the fuller "customer must never end with nothing" story).
- **Prices in code (`PACKS`) = no Stripe Products/Prices to maintain.** Buy side builds the amount, webhook re-checks it → the two stay in lockstep with one edit. If you need recurring subscriptions, that needs a real Stripe Price + `mode:"subscription"` — this pattern is one-time `mode:"payment"`.
- **Restricted key.** Use an `rk_live` restricted key scoped to Checkout Sessions (write) + Webhooks, not a full secret key.
- **Wallets (Apple/Google Pay)** need your domain registered with Stripe; Embedded Checkout handles the surface but the domain association is a dashboard step.
- **Theming is limited** with Embedded Checkout (Stripe runs the fields; you theme the surrounding panel + Dashboard branding). If brand-exact card fields matter more than Stripe running tax/shipping/methods, use the themed **Payment Element** instead (`ecommerce-supabase-stripe/themed-inapp-payments.md`).
