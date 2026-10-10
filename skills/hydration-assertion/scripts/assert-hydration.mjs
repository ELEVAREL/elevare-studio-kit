#!/usr/bin/env node
/**
 * assert-hydration.mjs — prove, per route, that React actually hydrated.
 *
 * The signal is a React FIBER COUNT (`__reactFiber$*` / `__reactProps$*` own-keys
 * on DOM nodes, plus `__reactContainer$*` / `_reactRootContainer` on the root).
 * Those keys are written by ReactDOM at hydrate time and CANNOT exist on a page
 * whose client tree never mounted. Element presence, `window.__next_f`, a clean
 * console and the response header all pass on a completely dead page — none of
 * them is the criterion here.
 *
 * Every run carries a KNOWN-DEAD CONTROL of the same route in the same browser.
 * If the control also reports "hydrated", the probe cannot tell working from
 * broken and the run is VOID — no green verdict is emitted.
 *
 * No dependencies. Node >= 22 (global WebSocket), local Chrome/Edge.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

/* ------------------------------------------------------------------ args -- */

function parseArgs(argv) {
  const a = {
    base: null,
    routes: [],
    sitemap: true,
    appDir: null,
    control: "csp", // csp | nojs | both | none(refused)
    settleMs: 12000,
    controlMs: 7000,
    json: null,
    chrome: null,
    headful: false,
    selfTest: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === "--base") a.base = v().replace(/\/+$/, "");
    else if (k === "--routes") a.routes.push(...v().split(",").map((s) => s.trim()).filter(Boolean));
    else if (k === "--no-sitemap") a.sitemap = false;
    else if (k === "--app-dir") a.appDir = v();
    else if (k === "--control") a.control = v();
    else if (k === "--settle") a.settleMs = Number(v());
    else if (k === "--control-settle") a.controlMs = Number(v());
    else if (k === "--json") a.json = v();
    else if (k === "--chrome") a.chrome = v();
    else if (k === "--headful") a.headful = true;
    else if (k === "--self-test") a.selfTest = true;
    else if (k === "--help" || k === "-h") a.help = true;
    else throw new Error(`unknown flag: ${k}`);
  }
  return a;
}

const HELP = `
assert-hydration --base <url> [options]

  --base <url>          required. e.g. https://example.vercel.app
  --routes a,b,c        explicit routes (merged with the discovered set)
  --no-sitemap          do not read /sitemap.xml
  --app-dir <path>      enumerate routes from a Next app dir (src/app) —
                        catches routes sitemap.xml omits (noindex, robots-
                        disallowed, in-app). THE ROUTE THAT BREAKS IS USUALLY ONE
                        OF THESE.
  --control csp|nojs|both
                        known-dead control (default csp). csp = rewrite the
                        document CSP to a nonce policy, reproducing the Next-16
                        nonce/prerender failure exactly. nojs = block every
                        script.
  --settle <ms>         max wait for hydration on a live load (default 12000)
  --control-settle <ms> max wait on a control load (default 7000)
  --json <file>         write the machine-readable result
  --chrome <path>       browser binary override
  --self-test           RED-CASE REHEARSAL. Breaks the LIVE load the same way
                        (nonce CSP injected on the document) and asserts the tool
                        reports RED. Run this against a healthy target once
                        before you believe a green run. Exit 0 = the tool goes
                        red on a broken page. Exit 1 = it does not — do not
                        trust its greens.
`;

/* ------------------------------------------------------------- discovery -- */

async function fromSitemap(base) {
  try {
    const res = await fetch(`${base}/sitemap.xml`, { redirect: "follow" });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
      .map((m) => m[1])
      .filter((u) => u.startsWith(base))
      .map((u) => new URL(u).pathname);
  } catch {
    return [];
  }
}

async function fromRobots(base) {
  try {
    const res = await fetch(`${base}/robots.txt`);
    if (!res.ok) return [];
    return [...(await res.text()).matchAll(/^\s*Disallow:\s*(\S+)\s*$/gim)]
      .map((m) => m[1])
      .filter((p) => p.startsWith("/") && !p.startsWith("/api") && !p.endsWith("*"));
  } catch {
    return [];
  }
}

function fromAppDir(root) {
  const out = [];
  const PAGE = /^page\.(tsx|ts|jsx|js|mdx)$/;
  const walk = (dir, segs) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((e) => e.isFile() && PAGE.test(e.name))) {
      out.push("/" + segs.join("/"));
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const n = e.name;
      if (n.startsWith("_") || n === "api" || n === "node_modules") continue;
      if (n.startsWith("@")) continue; // parallel route slot
      if (n.startsWith("(") && n.endsWith(")")) {
        walk(join(dir, n), segs); // route group — no URL segment
        continue;
      }
      walk(join(dir, n), [...segs, n]);
    }
  };
  walk(root, []);
  return out.map((p) => (p === "/" ? "/" : p.replace(/\/+$/, "")));
}

/* ------------------------------------------------------ raw HTTP evidence -- */

async function rawEvidence(base, route) {
  const url = base + route;
  let res, html;
  try {
    res = await fetch(url, { redirect: "follow", headers: { "user-agent": "hydration-assertion/1" } });
    html = await res.text();
  } catch (e) {
    return { url, error: String(e) };
  }
  const h = (n) => res.headers.get(n);
  const scripts = [...html.matchAll(/<script\b[^>]*>/gi)].map((m) => m[0]);
  const inline = scripts.filter((s) => !/\bsrc\s*=/.test(s)).length;
  const nonces = scripts.filter((s) => /\bnonce\s*=/.test(s)).length;
  const prerenderHeader = h("x-nextjs-prerender");
  const vercelCache = h("x-vercel-cache");
  let render = "unknown";
  if (prerenderHeader === "1") render = "prerendered";
  else if (vercelCache && /^(HIT|STALE|PRERENDER)$/i.test(vercelCache)) render = "prerendered?";
  else if (prerenderHeader === null && vercelCache) render = "dynamic";
  return {
    url,
    finalUrl: res.url,
    status: res.status,
    render,
    prerenderHeader,
    vercelCache,
    csp: h("content-security-policy"),
    cspHasNonce: /'nonce-/.test(h("content-security-policy") || ""),
    scriptTags: scripts.length,
    inlineScripts: inline,
    nonceAttrs: nonces,
    bytes: html.length,
  };
}

/* -------------------------------------------------------------- browser  -- */

function findBrowser(override) {
  if (override) return override;
  const c = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  for (const p of c) if (existsSync(p)) return p;
  throw new Error("no Chrome/Edge binary found — pass --chrome <path>");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(bin, headful) {
  const port = 9000 + Math.floor(Math.random() * 1000);
  const profile = mkdtempSync(join(tmpdir(), "hydr-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--window-size=1440,900",
  ];
  if (!headful) args.push("--headless=new", "--disable-gpu");
  const proc = spawn(bin, args, { stdio: "ignore" });
  for (let i = 0; i < 100; i++) {
    await sleep(150);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return { proc, port };
    } catch {}
  }
  proc.kill();
  throw new Error("browser did not expose a debugging port");
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(typeof e.data === "string" ? e.data : String(e.data));
      if (m.id !== undefined) {
        const p = this.pending.get(m.id);
        if (!p) return;
        this.pending.delete(m.id);
        m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
      } else {
        for (const fn of this.handlers.get(m.method) || []) fn(m.params);
      }
    });
  }
  static async open(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", rej, { once: true });
    });
    return new CDP(ws);
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.delete(id)) rej(new Error(`${method} timed out`));
      }, 30000);
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

/* ------------------------------------------------------------ the probe  -- */
/* The whole point of this file. Fiber keys are written by ReactDOM when it
 * hydrates; they cannot exist on a page whose client tree never mounted.
 * `__next_f` and element counts are reported ONLY as diagnostics — they are
 * true on a dead page and must never gate the verdict. */
const PROBE = `(() => {
  const nodes = document.querySelectorAll("*");
  const scan = Math.min(nodes.length, 4000);
  let fibers = 0;
  for (let i = 0; i < scan; i++) {
    const keys = Object.keys(nodes[i]);
    for (let j = 0; j < keys.length; j++) {
      const k = keys[j];
      if (k.charCodeAt(0) === 95 && (k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"))) { fibers++; break; }
    }
  }
  const rootish = [document.documentElement, document.body, ...document.body.children];
  let containers = 0;
  for (const el of rootish) {
    if (!el) continue;
    if (el._reactRootContainer) { containers++; continue; }
    if (Object.keys(el).some(k => k.startsWith("__reactContainer$"))) containers++;
  }
  return JSON.stringify({
    fibers, containers, domNodes: nodes.length, scanned: scan,
    hydrated: fibers > 0 || containers > 0,
    nextFlightChunks: Array.isArray(self.__next_f) ? self.__next_f.length : null,
    readyState: document.readyState
  });
})()`;

async function loadAndProbe(port, url, mode, budgetMs) {
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`, { method: "PUT" })).json();
  const cdp = await CDP.open(tab.webSocketDebuggerUrl);
  const consoleErrors = [];
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    cdp.on("Runtime.exceptionThrown", (p) =>
      consoleErrors.push(p?.exceptionDetails?.exception?.description || p?.exceptionDetails?.text || "exception")
    );

    if (mode === "nojs") {
      await cdp.send("Network.setBlockedURLs", { urls: ["*.js", "*.mjs", "*/_next/static/*"] });
    }

    if (mode === "csp") {
      // Reproduce the historical failure: a nonce-bearing policy. Under CSP the
      // presence of a nonce makes the browser IGNORE 'unsafe-inline', so the
      // prerendered inline bootstrap (self.__next_f.push(...)) is blocked while
      // external chunks still load — exactly Next 16's nonce/prerender trap.
      const kill = `hydrationassertion${Math.random().toString(36).slice(2)}`;
      await cdp.send("Fetch.enable", {
        patterns: [{ urlPattern: "*", requestStage: "Response", resourceType: "Document" }],
      });
      cdp.on("Fetch.requestPaused", async (p) => {
        try {
          const code = p.responseStatusCode || 200;
          if (code >= 300 && code < 400) {
            await cdp.send("Fetch.continueRequest", { requestId: p.requestId });
            return;
          }
          const body = await cdp.send("Fetch.getResponseBody", { requestId: p.requestId });
          const headers = (p.responseHeaders || []).filter(
            (h) => !/^content-security-policy/i.test(h.name) && !/^content-length$/i.test(h.name)
          );
          headers.push({
            name: "Content-Security-Policy",
            value: `script-src 'self' 'nonce-${kill}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src *`,
          });
          await cdp.send("Fetch.fulfillRequest", {
            requestId: p.requestId,
            responseCode: code,
            responseHeaders: headers,
            body: body.base64Encoded ? body.body : Buffer.from(body.body, "utf8").toString("base64"),
          });
        } catch {
          try {
            await cdp.send("Fetch.continueRequest", { requestId: p.requestId });
          } catch {}
        }
      });
    }

    const t0 = Date.now();
    await cdp.send("Page.navigate", { url });
    let last = null;
    while (Date.now() - t0 < budgetMs) {
      await sleep(250);
      try {
        const r = await cdp.send("Runtime.evaluate", { expression: PROBE, returnByValue: true, awaitPromise: false });
        if (r?.result?.value) {
          last = JSON.parse(r.result.value);
          if (last.hydrated) break;
        }
      } catch {
        /* navigation in flight — retry */
      }
    }
    const loc = await cdp.send("Runtime.evaluate", { expression: "location.href", returnByValue: true }).catch(() => null);
    return {
      ...(last || { fibers: 0, containers: 0, hydrated: false, domNodes: 0, note: "probe never returned" }),
      elapsedMs: Date.now() - t0,
      finalUrl: loc?.result?.value ?? null,
      pageErrors: consoleErrors.length,
      firstError: consoleErrors[0] || null,
    };
  } finally {
    cdp.close();
    try {
      await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`);
    } catch {}
  }
}

/** A route that redirected did NOT prove anything about itself. Say so. */
function redirectOf(base, route, finalUrl) {
  if (!finalUrl) return null;
  try {
    const got = new URL(finalUrl).pathname.replace(/\/+$/, "") || "/";
    const want = route.replace(/\/+$/, "") || "/";
    return got === want ? null : got;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------------- main   -- */

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.base) {
    console.log(HELP);
    process.exit(args.base ? 0 : 2);
  }
  if (!["csp", "nojs", "both"].includes(args.control)) {
    console.error("REFUSED: a run without a known-dead control proves nothing. --control must be csp | nojs | both.");
    process.exit(2);
  }

  const sources = {};
  let routes = ["/"];
  if (args.sitemap) {
    sources.sitemap = await fromSitemap(args.base);
    routes.push(...sources.sitemap);
  }
  sources.robotsDisallow = await fromRobots(args.base);
  routes.push(...sources.robotsDisallow);
  if (args.appDir) {
    sources.appDir = fromAppDir(args.appDir);
    routes.push(...sources.appDir);
  }
  sources.explicit = args.routes;
  routes.push(...args.routes);
  routes = [...new Set(routes.map((r) => (r === "" ? "/" : r)))].filter((r) => !r.includes("["));
  routes.sort();

  console.log(`\nhydration-assertion — ${args.base}`);
  console.log(`routes: ${routes.length}  (sitemap ${sources.sitemap?.length ?? 0} · robots ${sources.robotsDisallow.length} · app-dir ${sources.appDir?.length ?? 0} · explicit ${args.routes.length})`);
  if (!args.appDir) console.log("NOTE: no --app-dir. sitemap.xml omits noindex/in-app routes — the route that breaks is usually one of those.");
  console.log(`control: ${args.control}\n`);

  const bin = findBrowser(args.chrome);
  const { proc, port } = await launch(bin, args.headful);
  const results = [];
  const controls = args.control === "both" ? ["csp", "nojs"] : [args.control];

  try {
    for (const route of routes) {
      const http = await rawEvidence(args.base, route);
      const live = await loadAndProbe(port, args.base + route, args.selfTest ? "csp" : "live", args.settleMs);
      live.redirected = redirectOf(args.base, route, live.finalUrl);
      const ctl = {};
      for (const c of controls) ctl[c] = await loadAndProbe(port, args.base + route, c, args.controlMs);
      results.push({ route, http, live, control: ctl });
      const marks = controls.map((c) => `${c}:${ctl[c].hydrated ? "HYDRATED!!" : "dead"}`).join(" ");
      console.log(
        `  ${route.padEnd(24)} ${String(http.render).padEnd(13)} nonce=${String(http.nonceAttrs).padEnd(3)} inline=${String(http.inlineScripts).padEnd(3)} fibers=${String(live.fibers).padEnd(5)} ${live.hydrated ? "HYDRATED" : "NOT HYDRATED"}${live.redirected ? ` →${live.redirected}` : ""}   [control ${marks}]`
      );
    }
  } finally {
    proc.kill();
  }

  const controlAlive = results.filter((r) => Object.values(r.control).some((c) => c.hydrated));
  const dead = results.filter((r) => !r.live.hydrated);

  console.log("\n" + "-".repeat(104));
  console.log("route                    render        nonce inline  fibers  hydrated  control(dead?)        served");
  for (const r of results) {
    console.log(
      `${r.route.padEnd(24)} ${String(r.http.render).padEnd(13)} ${String(r.http.nonceAttrs).padEnd(5)} ${String(r.http.inlineScripts).padEnd(6)} ${String(r.live.fibers).padEnd(7)} ${(r.live.hydrated ? "yes" : "NO").padEnd(9)} ${Object.entries(r.control).map(([k, v]) => `${k}=${v.hydrated ? "ALIVE" : "dead"}(${v.fibers})`).join(" ").padEnd(21)} ${r.live.redirected ? `redirected → ${r.live.redirected}` : "itself"}`
    );
  }
  console.log("-".repeat(104));
  const redirected = results.filter((r) => r.live.redirected);
  if (redirected.length) {
    console.log(`NOTE: ${redirected.length} route(s) redirected. Their row is evidence about the DESTINATION, not the route.`);
    console.log("      Re-run those authenticated (or with a session cookie) before calling them covered.");
  }

  let verdict;
  if (controlAlive.length) {
    verdict = "VOID";
    console.log(`\nVERDICT: VOID — the known-dead control reported HYDRATED on ${controlAlive.length} route(s).`);
    console.log("The probe cannot distinguish a working page from a broken one. No green verdict is emitted.");
    console.log("Fix the control (or the probe) before trusting any result from this tool.");
  } else if (dead.length) {
    verdict = "RED";
    console.log(`\nVERDICT: RED — ${dead.length}/${results.length} route(s) served HTML but never hydrated:`);
    for (const r of dead)
      console.log(
        `  ${r.route}  (${r.http.render}, ${r.http.inlineScripts} inline, ${r.http.nonceAttrs} nonce attrs, ${r.live.fibers} fibers, ${r.live.pageErrors} page errors${r.live.firstError ? ` — ${r.live.firstError.split("\n")[0].slice(0, 80)}` : ""})`
      );
    const fingerprint = dead.filter((r) => r.http.render === "prerendered" && r.http.inlineScripts > 0 && r.http.nonceAttrs === 0);
    if (fingerprint.length) {
      console.log("\n  FIRST ROOT CAUSE TO CHECK — the Next 16 nonce/prerender interaction:");
      console.log(`  ${fingerprint.length} of the ${dead.length} failing route(s) match its fingerprint — PRERENDERED, shipping inline`);
      console.log(`  bootstrap scripts, carrying NO nonce attribute: ${fingerprint.map((r) => r.route).join(", ")}`);
      console.log("  Next 16 stamps nonces only on DYNAMICALLY rendered routes. Under CSP a nonce makes the browser IGNORE");
      console.log("  'unsafe-inline', so the prerendered inline bootstrap is blocked and React never hydrates. Check the CSP");
      console.log("  header for `'nonce-`. This failure is silent in next build, tsc, the test suite and the console.");
    }
  } else {
    verdict = "GREEN";
    console.log(`\nVERDICT: GREEN — ${results.length}/${results.length} routes hydrated; every control run went dead.`);
  }

  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ base: args.base, selfTest: args.selfTest, verdict, sources, results }, null, 2));
    console.log(`\nwrote ${args.json}`);
  }

  if (args.selfTest) {
    const pass = verdict === "RED";
    console.log(
      pass
        ? "\nSELF-TEST PASSED — with hydration deliberately broken on every live load, the tool reported RED.\nIts greens are worth something. Now run it for real (without --self-test)."
        : `\nSELF-TEST FAILED — hydration was deliberately broken on every live load and the tool said ${verdict}.\nDO NOT TRUST ITS GREENS. Fix the probe before using this tool as a gate.`
    );
    process.exit(pass ? 0 : 1);
  }
  process.exit(verdict === "GREEN" ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e?.stack || e);
  process.exit(3);
});
