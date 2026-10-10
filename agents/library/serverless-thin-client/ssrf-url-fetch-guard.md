# SSRF guard for any server-side fetch of a user-supplied URL

**When to reach for it:** any server endpoint that fetches a URL the user chose — an LLM "read this page" tool, a link-preview/oEmbed unfurler, an image proxy, an SSR screenshot, an "import from URL", a webhook-target validator. Without a guard, a user can point that fetch at `http://169.254.169.254/` (cloud metadata → credentials), `http://127.0.0.1:...` (your own internal services), or a private-LAN host — classic **SSRF**. This is a ~20-line drop-in that resolves the host and blocks loopback / private / link-local / metadata / CGNAT / IPv6-ULA ranges, refuses non-http(s) schemes, doesn't follow redirects, and caps the response size.

**Origin:** asky (`api/ask.js` — `ipBlocked` + `assertPublicUrl` + `fetchReadable`, guarding the `/read` URL tool). Generic; not tied to the thin-client stack.

---

```js
const dns = require("dns").promises;
const net = require("net");

// true = BLOCK. Fails closed: anything unparseable/empty blocks.
function ipBlocked(ip) {
  if (!ip) return true;
  if (net.isIPv4(ip)) {
    return /^(127|10|0)\./.test(ip) ||            // loopback / private-A / unspecified
      /^192\.168\./.test(ip) ||                    // private-C
      /^169\.254\./.test(ip) ||                    // link-local (incl. 169.254.169.254 metadata)
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||     // private-B (172.16–172.31)
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);  // CGNAT (100.64.0.0/10)
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" ||            // loopback / unspecified
      l.startsWith("fc") || l.startsWith("fd") ||  // unique-local (ULA)
      l.startsWith("fe80") ||                       // link-local
      l.startsWith("::ffff:");                      // IPv4-mapped IPv6 (dodge the v4 rules)
  }
  return true;                                      // not a recognizable IP -> block
}

// Validate a user URL and return a safe absolute URL string, or throw.
async function assertPublicUrl(raw) {
  let u; try { u = new URL(raw); } catch (_) { throw new Error("invalid url"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("only http/https urls are allowed");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host === "metadata.google.internal")
    throw new Error("that host isn't allowed");
  if (net.isIP(host) && ipBlocked(host)) throw new Error("that host isn't allowed");   // literal-IP hosts
  // RESOLVE the name and check EVERY answer — defeats DNS rebinding / a name that
  // points at a private IP. dns.lookup honors the OS resolver + /etc/hosts.
  let addrs = []; try { addrs = await dns.lookup(host, { all: true }); } catch (_) { throw new Error("could not resolve that host"); }
  for (const a of addrs) if (ipBlocked(a.address)) throw new Error("that host isn't allowed");
  return u.toString();
}

// Safe fetch: no redirects, size-capped, strip scripts/styles/tags if you want text.
async function fetchReadable(url) {
  const safe = await assertPublicUrl(url);
  const r = await fetch(safe, { headers: { "user-agent": "Mozilla/5.0 (bot)" }, redirect: "manual" });
  if (r.status >= 300 && r.status < 400) throw new Error("redirects aren't followed");  // a 30x could point at a blocked host
  const clen = parseInt(r.headers.get("content-length") || "0", 10);
  if (clen && clen > 5 * 1024 * 1024) throw new Error("that page is too large");
  let html = await r.text();
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 30000);
}
```

---

## Why each piece is load-bearing

1. **Resolve, then check — don't trust the hostname.** A hostname like `evil.example.com` can have an `A` record of `169.254.169.254` or `127.0.0.1`. Checking only the string lets that through; `dns.lookup({ all: true })` + `ipBlocked` on **every** returned address is what actually stops it.
2. **`redirect: "manual"` and reject 30x.** Otherwise a public URL can 302 you to `http://169.254.169.254/` **after** the check passed — the redirect target is never validated. Refuse redirects (or re-run `assertPublicUrl` on the `Location` and re-fetch, if you must follow them).
3. **Fail closed everywhere.** Unparseable URL, non-http(s) scheme, unresolvable host, unrecognized IP → throw/block. The default answer is "no".
4. **The `::ffff:` IPv4-mapped block matters.** `::ffff:127.0.0.1` is loopback wearing an IPv6 costume; without that prefix check it slips past both the v4 rules (it's not v4 to `net.isIPv4`) and the other v6 rules.
5. **CGNAT (`100.64/10`) is blocked** because in many hosting/VPN/mesh environments that range reaches internal infrastructure. Note the exact boundaries: `100.64`–`100.127` only; `100.63.x` and `100.128.x` are public and correctly allowed.
6. **Size cap + tag-strip** keep a hostile page from OOM-ing the function or injecting markup into whatever consumes the text.

## Test it (regression coverage worth keeping)

Drive `ipBlocked` directly with a known-BLOCK list and a known-ALLOW list — asky's suite covers loopback/private/link-local/metadata/CGNAT/IPv6-ULA/link-local/`::ffff:` on the block side, and genuine public v4/v6 **plus the just-outside-the-window boundaries** (`172.15.0.1`, `172.32.0.1`, `100.63.255.255`, `100.128.0.1`) on the allow side, and empty/unparseable → block. Boundary cases are where an off-by-one in the regex hides. `ipBlocked` is a pure function, so it unit-tests with zero setup (see `source-extraction-test-harness.md` for testing it even while it stays un-exported).

## Assumes / adapt

- **Node runtime** (uses `node:dns`/`node:net` and global `fetch`, Node 18+). On an edge runtime without `dns`, you can't resolve — either move the route to the Node runtime (`export const runtime = "nodejs"`) or restrict to an explicit allowlist of hostnames instead of a denylist.
- **This is a denylist of dangerous ranges** — appropriate for "fetch arbitrary public pages". If your use case only ever fetches from a known set of domains, prefer an **allowlist** (stronger). The denylist's residual risk is a range you didn't enumerate; keep it current.
- **A raw literal-IP host is checked directly** (`net.isIP(host) && ipBlocked(host)`) before DNS — don't skip that branch, or `http://127.0.0.1/` sails past because `dns.lookup` of an IP string just echoes it but some code paths short-circuit.
- **TOCTOU note:** between `assertPublicUrl` resolving and `fetch` connecting, DNS could change (rebinding). `redirect:"manual"` closes the redirect vector; for the strictest posture, resolve to a specific IP and fetch that IP with a `Host:` header, or use an agent that pins the resolved address. For most "read a public page" tools the resolve-then-fetch window is an acceptable risk.
- Complements — does not replace — the **inbound** loopback-API CSRF/RCE guard in `local-media-ai/loopback-api-rce-csrf-guard.md`. That one stops a web page from driving *your* local API; this one stops *your* server from being tricked into fetching an internal target. Opposite directions, both needed if you have both surfaces.
