# PWA that auto-updates on every deploy (installable, offline shell, no re-add-to-Home-Screen)

**When to reach for it:** any Next.js (or plain) web app you want people to **install to their phone's Home Screen** and have behave like a native app — its own icon, standalone chrome, an offline shell — while still picking up **every new deploy automatically**. The hard part isn't installability; it's that a naïvely-cached PWA gets *stuck on an old build* until the user deletes and re-adds it. This recipe makes an installed PWA silently pull the latest deploy (skipWaiting + one controlled reload) with **no user action**, while keeping auth/API/data calls always-live so nothing stale is ever served for a logged-in surface.

**Assumes / adapt:**
- **Hand-rolled service worker, not `next-pwa`.** Three files: `public/sw.js` (the worker), `src/app/sw-register.tsx` (a `"use client"` component that registers it + drives updates), and metadata/manifest in `layout.tsx` + `public/manifest.webmanifest`. Render `<ServiceWorker />` once in the root layout `<body>`. No build plugin, no config — copy the three files and rename the cache.
- **The update dance is the whole point.** New worker installs → page tells it `SKIP_WAITING` → it activates and fires `controllerchange` → the page reloads **once** to pull the new build. Guard the reload two ways: only when there **was** a previous controller (don't reload on first-ever install) and a `reloading` latch (never loop). Also call `reg.update()` on `focus`/`visibilitychange` so returning to an open PWA checks for a fresh deploy. This is what removes the "delete and re-add the icon" tax.
- **Cache the shell, never the live data.** `install` precaches only **public, stable** assets (offline page, manifest, one icon) — deliberately NOT auth-gated routes, or `addAll` can fail atomically / cache a login redirect for offline. `fetch`: bail on non-GET, cross-origin, and anything under `/api/` or `/auth/` (always network). Owner/authenticated routes (regex) get **network-first but are never written to cache**. Public navigations are network-first with a cached fallback then an offline page. Static assets are stale-while-revalidate. Adapt the owner-route regex and the SHELL list to your app.
- **`activate` deletes old caches** by name so a bumped `CACHE` constant (e.g. `pa804-v2`) evicts the previous version — bump it whenever the caching logic changes.
- **iOS reality:** installable + offline shell work on iOS, but Web Push and some APIs only work **after** the user adds to Home Screen and opens from there (see the push recipe). Set `appleWebApp` metadata and a maskable icon regardless.
- **Manifest essentials:** `display: "standalone"`, a real `start_url`/`scope`, `background_color`/`theme_color` that match your app ground (no white flash), and three icons incl. a `purpose:"maskable"` 512. Generate icons from the mark with a script (`scripts/gen-icons.mjs`) so they stay in sync.
- **Reference:** `D:\precisionaim` — `public/sw.js`, `src/app/sw-register.tsx`, `src/app/layout.tsx` (metadata + `<ServiceWorker/>`), `public/manifest.webmanifest`, `scripts/gen-icons.mjs`.

## 1. The registrant + update driver (`src/app/sw-register.tsx`)

```tsx
"use client";
import { useEffect } from "react";

export function ServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const hadController = Boolean(navigator.serviceWorker.controller);   // false on first install
    let reloading = false;
    const onControllerChange = () => {                                   // new worker took control…
      if (reloading || !hadController) return;                           // …reload once, but not on first install
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) nw.postMessage("SKIP_WAITING");
          });
        });
        const check = () => reg.update().catch(() => {});                // re-check for a new deploy on return
        window.addEventListener("focus", check);
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") check(); });
      } catch { /* non-fatal: app still works online */ }
    };
    window.addEventListener("load", register);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("load", register);
    };
  }, []);
  return null;
}
```

## 2. The worker (`public/sw.js`) — shell cache + activate-immediately + safe fetch routing

```js
const CACHE = "app-v2";                                              // bump to evict old caches
const SHELL = ["/offline.html", "/manifest.webmanifest", "/icons/icon-192.png"];  // public + stable ONLY

self.addEventListener("install", (e) =>
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));

self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())));

self.addEventListener("message", (e) => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;   // always live

  const isOwnerRoute = /^\/(dashboard|sale|sales|catalog)(\/|$)/.test(url.pathname);    // adapt to your app

  if (request.mode === "navigate") {                                  // network-first navigations
    e.respondWith(
      fetch(request).then((res) => {
        if (!isOwnerRoute) caches.open(CACHE).then((c) => c.put(request, res.clone())).catch(() => {});
        return res;                                                   // never cache authenticated pages
      }).catch(() => caches.match(request).then((r) => r || caches.match("/offline.html"))));
    return;
  }

  e.respondWith(caches.match(request).then((cached) => {             // static assets: stale-while-revalidate
    const network = fetch(request).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone())).catch(() => {});
      return res;
    }).catch(() => cached);
    return cached || network;
  }));
});
```

## 3. Metadata + manifest wiring (`layout.tsx` / `manifest.webmanifest`)

```tsx
export const metadata: Metadata = {
  applicationName: "MyApp",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MyApp" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192" }], apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
};
export const viewport: Viewport = { themeColor: "#0b0e10", viewportFit: "cover", initialScale: 1, width: "device-width" };
// …and render <ServiceWorker /> once inside <body>.
```
```json
{ "name": "MyApp", "short_name": "MyApp", "start_url": "/dashboard", "scope": "/",
  "display": "standalone", "orientation": "portrait", "background_color": "#0b0e10", "theme_color": "#0b0e10",
  "icons": [ { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
             { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
             { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" } ] }
```

**The failure this prevents:** a merchant installs the PWA, you ship a bug fix, and without the skipWaiting + controlled-reload dance they keep running the broken build for days with no way to know — the only "fix" being delete-and-reinstall. With this, the next time they open (or focus) the app, it silently updates.
