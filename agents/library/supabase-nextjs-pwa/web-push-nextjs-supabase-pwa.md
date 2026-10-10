# Web Push on a Next.js + Supabase PWA (VAPID, subscribe-from-client, server-send from a webhook)

**When to reach for it:** you want an installed PWA to get a **real push notification** even when the app is closed — "you got paid," "new order," "job status changed" — fired from your **server** (often a webhook), on a stack with no native app and no third-party push SDK. This is the end-to-end Web Push recipe: generate VAPID keys once, subscribe the device from the client, persist the subscription in Supabase, and send from Node with `web-push` — including the two things people get wrong (the secret-gated read of subscriptions from a session-less server context, and the iOS "must add to Home Screen first" caveat).

**Assumes / adapt:**
- **Pairs with the two sibling recipes.** It needs the service worker's `push` + `notificationclick` handlers ([`pwa-auto-update-install.md`](pwa-auto-update-install.md)) and it reads subscriptions via a **secret-gated SECURITY DEFINER RPC** because the sender runs with no user session ([`service-role-free-supabase-security.md`](service-role-free-supabase-security.md)). Don't reach for this one alone.
- **VAPID keys, generated once.** `npx web-push generate-vapid-keys`. Public key → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (shipped to the client, used as `applicationServerKey`). Private key → `VAPID_PRIVATE_KEY` (server only). Plus `VAPID_SUBJECT` (a `mailto:` you control). If you rotate them, existing subscriptions die and every device must re-subscribe.
- **Subscribe from the client, persist to a table.** A `"use client"` card asks `Notification.requestPermission()`, then `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, then upserts `{endpoint, p256dh, auth}` into `push_subscriptions` (unique on `endpoint`). That table is staff-only under RLS — the owner writes their own rows with their session; the server reads them via RPC, not directly.
- **Send from the server via a secret-gated RPC, and prune dead endpoints.** The sender (fired from the payment webhook, which has no session) calls `get_push_targets(p_secret)` — a definer RPC gated by the same `SETTLE_SECRET`/`app_private.config` secret used for settlement — to get all subscriptions, then `web-push`es each. On a `404`/`410` (subscription gone) it calls `delete_push_subscription(p_secret, endpoint)` to self-heal. Everything is a **safe no-op if VAPID isn't configured** so the app runs fine before push is set up.
- **`import "server-only"` on the sender** so the private VAPID key and `web-push` never leak into a client bundle.
- **iOS caveat is load-bearing — surface it in the UI.** Safari only grants Web Push to a PWA that's been **added to the Home Screen and opened from there** — not in the browser tab. If `subscribe()` throws, show the exact instruction ("Share → Add to Home Screen, open it from there, try again") rather than a generic error, or iPhone users think it's broken.
- **Fire push best-effort, never block the primary flow.** In the webhook, `await sendPushToOwner(...).catch(() => {})` *after* the order is settled — a push failure must not fail the settlement or make the processor retry.
- **Reference:** `D:\precisionaim` — `src/lib/push.ts` (server sender), `src/components/notifications.tsx` (subscribe UI), `src/app/api/notify-test/route.ts` (owner-only test), push/notificationclick handlers in `public/sw.js`, and the `get_push_targets`/`delete_push_subscription` RPCs (see the security recipe).

## 1. Subscribe from the client + persist (`src/components/notifications.tsx`)

```ts
function urlB64ToUint8Array(b64: string): Uint8Array {              // VAPID public key → applicationServerKey
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function enable() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as BufferSource,
  });
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  await supabase.from("push_subscriptions")                        // owner writes own row (RLS: is_staff())
    .upsert({ endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth }, { onConflict: "endpoint" });
}
// On throw, show the iOS instruction verbatim:
//   "On iPhone, first add this app to your Home Screen (Share → Add to Home Screen),
//    open it from there, then try again."
// Guard support up front: 'serviceWorker' in navigator && 'PushManager' in window &&
//   'Notification' in window && Boolean(VAPID); else render nothing.
```

## 2. Server sender — session-less, secret-gated, self-pruning (`src/lib/push.ts`)

```ts
import "server-only";
import webpush from "web-push";
import { createAnonClient } from "@/lib/supabase/server";

export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
let configured = false;
function ensure() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  configured = true;
}

export async function sendPushToOwner(payload: { title: string; body: string; url?: string; tag?: string }) {
  if (!pushConfigured()) return { sent: 0, total: 0 };            // safe no-op before setup
  ensure();
  const secret = process.env.SETTLE_SECRET;
  if (!secret) return { sent: 0, total: 0 };

  const supabase = createAnonClient();                            // NO session here — read via secret-gated RPC
  const { data } = await supabase.rpc("get_push_targets", { p_secret: secret });
  const targets = (data ?? []) as { endpoint: string; p256dh: string; auth: string }[];
  const body = JSON.stringify(payload);

  let sent = 0;
  await Promise.all(targets.map(async (t) => {
    try { await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, body); sent++; }
    catch (err: any) {
      if (err?.statusCode === 404 || err?.statusCode === 410)      // dead subscription → self-heal
        await supabase.rpc("delete_push_subscription", { p_secret: secret, p_endpoint: t.endpoint }).then(()=>{},()=>{});
    }
  }));
  return { sent, total: targets.length };
}
```

## 3. Service worker handlers (add to `public/sw.js`)

```js
self.addEventListener("push", (e) => {
  let d = { title: "MyApp", body: "You have a new notification.", url: "/dashboard" };
  try { if (e.data) d = { ...d, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    vibrate: [80, 40, 80], tag: d.tag || undefined, data: { url: d.url || "/dashboard" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = e.notification.data?.url || "/dashboard";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(target).catch(()=>{}); return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
```

## 4. Fire it from the webhook (best-effort, after settlement)

```ts
// api/webhook/route.ts — AFTER settle_order succeeds:
await sendPushToOwner({ title: "Payment received", body: `${formatMoney(amount)} paid by card`,
                        url: "/sales", tag: orderId }).catch(() => {});   // never fail the webhook on a push error
```

An owner-only `/api/notify-test` route (`auth.getUser()` → `is_staff()` RPC → `sendPushToOwner`) gives the settings UI a "Test" button so a merchant can confirm alerts work before relying on them.
