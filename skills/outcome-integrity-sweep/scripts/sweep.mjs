#!/usr/bin/env node
/**
 * outcome-integrity-sweep — find WRITES AND SENDS WHOSE OUTCOME IS NEVER READ,
 * and that are followed by a user-visible success claim.
 *
 * The gate is NOT "a bare await". A bare await is everywhere and most of them
 * are fine. The gate is:
 *
 *      an outcome envelope is produced      (a write / send / invoke returns one)
 *   +  nobody reads it                      (dropped statement, or `error` bound and never referenced)
 *   +  a success claim fires afterwards     (toast, chime, sent:true, a 200)
 *
 * Drop any one of the three and you have a different, usually benign, thing:
 * best-effort telemetry drops the outcome on purpose, and a checked write that
 * chimes is exactly right.
 *
 *   node sweep.mjs [dir] [--changed <git-ref>] [--min low|high|critical]
 *                        [--window N] [--all] [--json]
 *
 * Exit 0 always. This tool NOMINATES lines for a human read. It never verdicts.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n) => (argv.includes(`--${n}`) ? argv[argv.indexOf(`--${n}`) + 1] : null);
const CONSUMES = new Set(["--changed", "--min", "--window"]);
const positional = argv.filter((a, i) => !a.startsWith("--") && !CONSUMES.has(argv[i - 1]));
const root = path.resolve(positional[0] ?? ".");
const OPT = {
  json: flag("json"),
  all: flag("all"),
  changed: val("changed"),
  min: (val("min") || "high").toLowerCase(),
  window: Number(val("window") || 80),
  calibrate: flag("calibrate"),
};

const SKIP_DIR = /^(node_modules|\.git|\.next|\.turbo|dist|build|out|coverage|vendor|\.venv|__pycache__|\.vercel|generated|android|ios|public)$/;
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const RANK = { low: 0, high: 1, critical: 2 };

/* ============================================================ 0. MASKING
   Two views of every line. `raw` keeps string contents (the success claim is a
   STRING — "Cash logged"). `code` blanks comments and string bodies so brace
   depth and statement shape cannot be thrown off by a `{` inside a message.
   Template literals are blanked WHOLE, `${...}` included, so depth stays balanced. */

function mask(src) {
  const out = Array.from(src);
  let i = 0, n = src.length;
  let inLine = false, inBlock = false, q = null, tplDepth = 0;
  const blank = (k) => { if (out[k] !== "\n") out[k] = " "; };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (inLine) { if (c === "\n") inLine = false; else blank(i); i++; continue; }
    if (inBlock) { if (c === "*" && d === "/") { blank(i); blank(i + 1); inBlock = false; i += 2; continue; } blank(i); i++; continue; }
    if (q) {
      if (c === "\\") { blank(i); blank(i + 1); i += 2; continue; }
      if (c === q && (q !== "`" || tplDepth === 0)) { blank(i); q = null; i++; continue; }
      if (q === "`" && c === "$" && d === "{") { tplDepth++; blank(i); blank(i + 1); i += 2; continue; }
      if (q === "`" && c === "}" && tplDepth > 0) { tplDepth--; blank(i); i++; continue; }
      if (c === "\n") { i++; continue; }
      blank(i); i++; continue;
    }
    if (c === "/" && d === "/") { inLine = true; blank(i); blank(i + 1); i += 2; continue; }
    if (c === "/" && d === "*") { inBlock = true; blank(i); blank(i + 1); i += 2; continue; }
    if (c === "'" || c === '"' || c === "`") { q = c; blank(i); i++; continue; }
    i++;
  }
  return out.join("");
}

/* Depth at the START of each line, plus function frames. */
function structure(codeLines) {
  const depthAt = [];
  let d = 0;
  for (const ln of codeLines) {
    depthAt.push(d);
    for (const ch of ln) { if (ch === "{") d++; else if (ch === "}") d--; }
  }
  const FN_OPEN = /(=>\s*\{|\bfunction\b[^{]*\{|\basync\s*\([^)]*\)\s*\{|\)\s*:\s*[A-Za-z<>[\]|\s,.]+\s*=>\s*\{)/;
  const frames = [];
  for (let i = 0; i < codeLines.length; i++) {
    if (!FN_OPEN.test(codeLines[i])) continue;
    const open = depthAt[i];
    let end = codeLines.length - 1;
    for (let j = i + 1; j < codeLines.length; j++) if (depthAt[j] <= open) { end = j; break; }
    frames.push({ start: i, end });
  }
  return { depthAt, frames };
}
const frameOf = (frames, line, fallbackEnd) => {
  let best = null;
  for (const f of frames) if (f.start <= line && line <= f.end) if (!best || f.start > best.start) best = f;
  return best ? best.end : fallbackEnd;
};

/* ================================================ 1. IS AN OUTCOME PRODUCED?
   Tier A produces an envelope a caller is expected to inspect, and nominates on
   its own. Tier B is generic enough that it is only worth a row when a success
   claim also fires — otherwise this rebuilds the 811-hit grep it exists to avoid. */

/* ---------------------------------------------------------------------------
   THE CLIENT IS RESOLVED BY ASSIGNMENT AND BY METHOD SHAPE, NEVER BY NAME.

   The first version of this file keyed Tier A on the literal identifier
   `supabase`. Measured 2026-09-14 in D:\elevare-studio: src/lib/report/store.ts
   binds the service client as `svc`, so the exact defect this tool exists to
   catch (a bare `await svc.from(...).update(...)` with no destructure) did not
   fire, while the byte-identical statement spelled `supabase` fired CRITICAL.
   Twelve statements in that one file were never swept. A gate that depends on
   what a variable happens to be called is not a gate.

   A client is now any of:
     1. a variable assigned from a client FACTORY call (createClient,
        createServerClient, createBrowserClient, getServiceClient, ...);
     2. a variable whose TYPE ANNOTATION is SupabaseClient;
     3. a variable assigned from a LOCAL function whose declared return type is
        SupabaseClient (this is the `const svc = service()` shape in store.ts);
     4. a variable DERIVED from one of the above by `.schema(...)`, `.from(...)`
        or plain aliasing;
     5. any identifier carrying the PostgREST METHOD SHAPE somewhere in the file
        (`x.from(<arg>).insert|update|upsert|delete|select(`,
        `x.functions.invoke(`, `x.storage.from(`). This is what resolves a client
        that arrives as a FUNCTION PARAMETER, e.g. report-worker.mjs's
        `async function meterAttempt(db, ...)`, which no assignment rule can see.
--------------------------------------------------------------------------- */

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* Named, not inferred. Each entry is a factory that hands back a supabase-js
   client, so whatever it is assigned to IS a client whatever it is called. */
const BUILTIN_FACTORY = new Set([
  "createClient", "createServerClient", "createBrowserClient",
  "createRouteHandlerClient", "createServerComponentClient",
  "createServerActionClient", "createPagesBrowserClient", "createPagesServerClient",
  "createMiddlewareClient", "createServiceClient", "createServiceRoleClient",
  "createSupabaseClient", "createAdminClient",
  "getServiceClient", "getServiceRoleClient", "getSupabaseClient",
  "getSupabaseAdmin", "getSupabase", "supabaseAdmin", "serviceClient",
  "serviceRoleClient", "supabaseService", "adminClient",
]);

/* Receivers that carry `.from(` in the standard library and are never a database
   client. Named so the exclusion is auditable rather than silent. */
const NOT_A_CLIENT = new Set([
  "Array", "Object", "Date", "Buffer", "String", "Number", "Boolean",
  "Math", "JSON", "Promise", "Set", "Map", "WeakMap", "WeakSet", "Reflect",
  "Int8Array", "Uint8Array", "Float32Array", "Float64Array", "BigInt",
]);

/* The PostgREST call shape, receiver left OPEN. This is the rule that makes the
   sweep independent of the binding name. `.from(<args>)` then a write verb. */
const NOT_A_CLIENT_ALT = "Array|Object|Date|Buffer|String|Number|Boolean|Math|JSON|Promise|Set|Map|WeakMap|WeakSet|Reflect|Int8Array|Uint8Array|Float32Array|Float64Array|BigInt";
const SHAPE_WRITE = new RegExp(`\\b(?!(?:${NOT_A_CLIENT_ALT})\\b)[A-Za-z_$][\\w$]*\\s*\\.\\s*from\\s*\\([^;]{0,160}?\\.\\s*(insert|update|upsert|delete)\\s*\\(`);
const SHAPE_READ = new RegExp(`\\b(?!(?:${NOT_A_CLIENT_ALT})\\b)[A-Za-z_$][\\w$]*\\s*\\.\\s*from\\s*\\([^;]{0,160}?\\.\\s*select\\s*\\(`);

/** Every identifier in this file that is a database client. */
function resolveClients(codeLines) {
  const src = codeLines.join("\n");
  const idents = new Set();
  const factories = new Set(BUILTIN_FACTORY);

  // (3) local factory: `function service(): SupabaseClient | null {`
  for (const m of src.matchAll(
    /(?:function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\))\s*:\s*(?:Promise\s*<\s*)?SupabaseClient/g
  )) factories.add(m[1] || m[2]);

  // (2) typed binding: `let cached: SupabaseClient | null = null`
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*:\s*(?:Promise\s*<\s*)?SupabaseClient/g))
    idents.add(m[1]);

  // (5) method shape anywhere in the file resolves parameters and imports alike.
  for (const re of [
    /\b([A-Za-z_$][\w$]*)\s*\.\s*from\s*\([^;]{0,160}?\.\s*(?:insert|update|upsert|delete|select)\s*\(/g,
    /\b([A-Za-z_$][\w$]*)\s*\.\s*functions\s*\.\s*invoke\s*\(/g,
    /\b([A-Za-z_$][\w$]*)\s*\.\s*storage\s*\.\s*from\s*\(/g,
  ]) for (const m of src.matchAll(re)) if (!NOT_A_CLIENT.has(m[1])) idents.add(m[1]);

  // (1) + (4), to a fixed point: a factory assignment, an alias, a derivation.
  for (let pass = 0; pass < 3; pass++) {
    for (const m of src.matchAll(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]{0,120})?=\s*(?:await\s+)?([A-Za-z_$][\w$.]*)\s*\(/g
    )) { const fn = m[2].split(".").pop(); if (factories.has(fn) || factories.has(m[2])) idents.add(m[1]); }
    for (const m of src.matchAll(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]{0,120})?=\s*([A-Za-z_$][\w$]*)\s*(?:\.\s*(?:schema|from)\s*\([^()]{0,120}\)\s*)?[;\n]/g
    )) if (idents.has(m[2])) idents.add(m[1]);
  }

  idents.add("supabase");   // the historical default still holds, it is just no longer the only rule
  return idents;
}

/* Tier A produces an envelope a caller is expected to inspect. Built PER FILE
   from that file's resolved client set, plus the name-free shape rule. */
function tierAFor(clients) {
  const C = `(?:${[...clients].map(esc).join("|")})`;
  return [
    // Bounded, no nested quantifier. A nested `(?:...)*` here backtracked
    // catastrophically on generated type files and hung the whole sweep.
    [new RegExp(`\\b${C}[\\w.]*\\s*\\.\\s*from\\s*\\([^;]{0,160}?\\.\\s*(insert|update|upsert|delete)\\s*\\(`), "supabase write"],
    [SHAPE_WRITE, "postgrest write (client resolved by method shape)"],
    [new RegExp(`\\b${C}[\\w.]*\\s*\\.\\s*rpc\\s*\\(`), "supabase rpc"],
    [new RegExp(`\\b${C}[\\w.]*\\s*\\.\\s*functions\\s*\\.\\s*invoke\\s*\\(`), "edge function invoke"],
    [new RegExp(`\\b${C}[\\w.]*\\s*\\.\\s*auth\\s*\\.\\s*(?!getSession|getUser)\\w+\\s*\\(`), "supabase auth write"],
    [new RegExp(`\\b${C}[\\w.]*\\s*\\.\\s*storage\\s*\\.\\s*from\\s*\\([^)]*\\)\\s*\\.\\s*(upload|remove|move|copy)\\s*\\(`), "supabase storage write"],
    [/\b(?:resend|sg|sgMail|mailer|transporter|ses|postmark)\s*\.\s*(?:emails\s*\.\s*)?send(?:Mail|Email)?\s*\(/i, "email send"],
    [/\b(?:send|notify|email|dispatch|deliver|enqueue|publish|broadcast|alert|post)[A-Z]\w*\s*\(/, "send/notify call"],
    [/\bsend(?:Mail|Email|Sms|Text|Notification|Alert|Message)\s*\(/i, "send call"],
    // NOT stripe-node. The whole class is libraries that RESOLVE with an error
    // instead of throwing; stripe-node throws, so `try { await stripe.x.create() }`
    // really is handled. Listing it produced 6 false rows on fantahair's webhook.
  ];
}
const TIER_B = [
  [SHAPE_READ, "postgrest read"],
  [/\bfetch\s*\(/, "fetch"],
  [/\baxios\s*(?:\.\s*\w+)?\s*\(/, "axios"],
  [/\bprisma\s*\.\s*\w+\s*\.\s*(create|update|delete|upsert|createMany|updateMany)\s*\(/i, "prisma write"],
  [/\.\s*(save|commit|flush|exec|execute)\s*\(\s*\)/i, "orm write"],
];
const classify = (stmt, tierA) => {
  for (const [re, label] of tierA) if (re.test(stmt)) return { tier: "A", label };
  for (const [re, label] of TIER_B) if (re.test(stmt)) return { tier: "B", label };
  return null;
};
const MUTATING = /(insert|update|upsert|delete|rpc|invoke|send|notify|email|create|refund|capture|upload|remove)/i;
const UNAMBIGUOUS_WRITE = /\.\s*(insert|update|upsert|delete|upload)\s*\(|\bsend\w*\s*\(|\bnotify\w*\s*\(|\bemail\w*\s*\(|\.\s*(create|refund|capture|cancel)\s*\(/i;

/* Telemetry: dropping the outcome here is usually deliberate, so it ranks low
   unless a success claim proves a user was told it worked. */
/* Applied to the TARGET NAME ONLY (the table / function being written), never to
   the whole statement — a payload field called `tracking_code` is not telemetry. */
const TELEMETRY = /(^|_)(logs?|analytics|telemetry|metrics?|audit|events?|heartbeat|ping|traces?)($|_)/i;
const targetName = (rawStmt) => {
  const m = /\.\s*(?:from|invoke|rpc)\s*\(\s*["'`]([^"'`]+)["'`]/.exec(rawStmt);
  return m ? m[1] : "";
};
const SEND_SHAPED = /\b(send|notify|email|deliver|dispatch|alert)\w*\s*\(|emails\s*\.\s*send|sendMail\s*\(/i;
const BEST_EFFORT = /best[- ]effort|fire[- ]and[- ]forget|do not block|non-?blocking|optional|advisory only/i;
/* An EXPLICIT decision to not wait for, or not care about, the outcome. These are
   the author saying "I know" in code rather than in a comment. */
const DECLARED_ASYNC = /\bbackground\s*\(|\bwaitUntil\s*\(|EdgeRuntime\s*\.\s*waitUntil|\bvoid\s+await\b|\.\s*catch\s*\(/;

/* ==================================================== 2. IS THE OUTCOME READ? */

// `const { a, b: c } = await ...`  ->  [{name:'a',src:'a'}, {name:'c',src:'b'}]
function destructured(codeStmt) {
  const m = /^\s*(?:const|let|var)\s*\{([^}]*)\}\s*=\s*await\b/.exec(codeStmt);
  if (!m) return null;
  return m[1].split(",").map((p) => p.trim()).filter(Boolean).map((p) => {
    const [src, alias] = p.split(":").map((s) => s.trim());
    return { src: src.replace(/\W.*$/, ""), name: (alias || src).replace(/\W.*$/, "") };
  }).filter((b) => b.name);
}
function plainBinding(codeStmt) {
  const m = /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*await\b/.exec(codeStmt);
  return m ? m[1] : null;
}
/** Referenced anywhere in [from,to] before the same name is re-declared. */
function referenced(codeLines, name, from, to) {
  const use = new RegExp(`\\b${name.replace(/[$]/g, "\\$")}\\b`);
  const redecl = new RegExp(`(?:const|let|var)\\s*(?:\\{[^}]*\\b${name}\\b[^}]*\\}|\\b${name}\\b)\\s*=`);
  for (let i = from; i <= to && i < codeLines.length; i++) {
    if (redecl.test(codeLines[i])) return false;
    if (use.test(codeLines[i])) return true;
  }
  return false;
}

/* ========================================== 3. IS A SUCCESS CLAIM MADE AFTER?
   Ordering matters and is the whole discriminator. A chime BEFORE the write is
   about something else; a chime AFTER an unread outcome is the defect. */

const SUCCESS_WORD = /["'][^"']*\b(recorded|logged|saved|sent|updated|created|posted|booked|confirmed|scheduled|submitted|marked as done|completed|success|we'?ll be in touch|on its way|thanks)\b[^"']*["']/i;
const FAILURE_WORD = /\b(destructive|fail|failed|error|not logged|couldn'?t|could not|unable|problem|wrong|denied|refused|invalid)\b/i;
/* A success WORD inside an object property is usually a column value being
   written (`status: "completed"`), not something a human is told. Only the
   properties that end up on a screen count. */
const PROP_LINE = /^\s*(?:["']?)([A-Za-z_$][\w$]*)(?:["']?)\s*:\s*["'`]/;
const UI_PROP = /^(title|description|message|msg|text|label|detail|toast|heading|reason)$/i;
/* The flow proceeds to a terminal state as if the unread write had landed. */
const TERMINAL_CALL = /\b(complete|finali[sz]e|settle|confirmPaid|markDone|mark\w*(Done|Paid|Complete|Sent))\w*\s*\(/i;
/* STRONG = an explicit assertion that this thing worked. WEAK = the handler
   merely finished without erroring. Weak evidence is everywhere in a server
   function (almost every handler ends in a 200) and must not, on its own, make a
   row critical — that is how a sweep turns into hits nobody reads. */
const CLAIM_PATTERNS = [
  [/play\w*Sound\s*\(\s*["'`]success/i, "success chime", "strong"],
  [/toast\s*\.\s*success\s*\(/i, "success toast", "strong"],
  [/set\w*(Success|Confirmed|Sent|Delivered|Done|Complete)\w*\s*\(/, "success state", "strong"],
  [/\b(ok|success|sent|delivered|logged)\s*:\s*true\b/i, "success:true returned", "strong"],
  [/status\s*:\s*200\b|\.status\s*\(\s*200\s*\)/, "HTTP 200", "weak"],
];
const RESPONSE_RE = /(NextResponse\s*\.\s*json\s*\(|new\s+Response\s*\(|res\s*\.\s*(?:json|send)\s*\(|Response\s*\.\s*json\s*\()/;
const ERRORISH_STATUS = /\b(4\d\d|5\d\d)\b/;

function successClaim(rawLines, from, to, isServer) {
  for (let i = from; i <= to && i < rawLines.length; i++) {
    const ln = rawLines[i];
    // Not a claim to a HUMAN, and in two cases not a claim at all:
    //  - a log line (`console.*`, `logStep(...)`) is read by nobody as it lies
    //  - `.eq("status", "completed")` is a query FILTER; "completed" is not copy
    //  - `case "sent":` is a switch label
    // All three produced misattributed claims on fantahair before this filter.
    if (/\b(?:console\s*\.|log|logStep|logDebug|logInfo|logger|debug|trace)\s*\(/.test(ln)) continue;
    if (/\.\s*(eq|neq|in|gt|gte|lt|lte|like|ilike|is|match|filter|contains|order|select|not)\s*\(/.test(ln)) continue;
    if (/^\s*case\s+["'`]/.test(ln)) continue;
    for (const [re, label, strength] of CLAIM_PATTERNS) if (re.test(ln)) return { line: i, label, strength, text: ln.trim() };
    if (/\btoast\s*\(/.test(ln)) {
      const blob = rawLines.slice(i, Math.min(i + 4, rawLines.length)).join(" ");
      if (!FAILURE_WORD.test(blob)) return { line: i, label: "toast", strength: "strong", text: ln.trim() };
    }
    if (TERMINAL_CALL.test(ln) && /\bawait\b|\breturn\b|^\s*\w/.test(ln))
      return { line: i, label: "flow proceeds to a terminal state", strength: "strong", text: ln.trim() };
    const prop = PROP_LINE.exec(ln);
    if (SUCCESS_WORD.test(ln) && !FAILURE_WORD.test(ln) && (!prop || UI_PROP.test(prop[1])))
      return { line: i, label: "success copy", strength: "strong", text: ln.trim() };
    if (isServer && RESPONSE_RE.test(ln)) {
      const blob = rawLines.slice(i, Math.min(i + 3, rawLines.length)).join(" ");
      if (!ERRORISH_STATUS.test(blob) && !FAILURE_WORD.test(blob)) return { line: i, label: "responds OK", strength: "weak", text: ln.trim() };
    }
  }
  return null;
}
/** archive-then-delete: an unread write followed by a destructive op is critical
    with or without a UI claim — a refused copy then a real delete. */
function destructiveFollow(codeLines, from, to) {
  for (let i = from; i <= to && i < codeLines.length; i++) {
    // A delete on the FAILURE path is the opposite of the bug — it is a
    // compensating release ("the enqueue threw, so drop the claim row"). Both of
    // fantahair's notification functions do exactly this, and counting them was
    // this rule's only two false rows. Stop at the catch.
    if (/\}\s*catch\b|^\s*catch\s*\(/.test(codeLines[i])) return null;
    if (/\.\s*(delete|remove|destroy)\s*\(/.test(codeLines[i])) return i;
  }
  return null;
}

/* ==================================================================== 4. SCAN */

function statementAt(codeLines, i) {
  let text = "", depth = 0, end = i;
  for (let j = i; j < codeLines.length && j < i + 60; j++) {
    const ln = codeLines[j];
    text += (j > i ? " " : "") + ln.trim();
    for (const ch of ln) { if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth--; }
    end = j;
    if (depth <= 0 && /[;)}\]]\s*$/.test(ln.trim())) {
      /* A METHOD CHAIN CONTINUES ACROSS LINES, and stopping here truncated it.
         `await svc` / `.from(SITE_REPORTS_TABLE)` / `.update({...})` is ONE
         statement; the second line is balanced and ends in `)`, so the old code
         broke there and handed `classify()` the text `await svc .from(T)` -
         which carries no write verb at all. Every multi-line PostgREST write in
         the repo therefore swept clean, whatever the client was called.
         Measured on D:\elevare-studio\src\lib\report\store.ts, 2026-09-28: the
         injected bare `update` did not fire until this was fixed. */
      if (!/;\s*$/.test(ln.trim())) {
        let k = j + 1;
        while (k < codeLines.length && !codeLines[k].trim()) k++;
        if (k < codeLines.length && /^\??\s*\./.test(codeLines[k].trim())) continue;
      }
      break;
    }
  }
  return { text: text.replace(/\s+/g, " "), end };
}

/* A trailing `{` OPENS A BLOCK — `try {`, `if (...) {`, `} else {`, `for (...) {`.
   Treating it as a continuation is why the first draft of this tool missed four
   of the six known-bad writes in fantahair's completeItem(). Do not add it back. */
const CONTINUATION = /[=+\-*/%<>&|?:,(\[]\s*$|\breturn\s*$|\bawait\s*$/;

/* ============================== 2b. WHAT DOES THE LOCAL CALLEE ACTUALLY DO?
   The Petal bug in one sentence: `sendEmail()` RETURNED {sent:false,…} and
   `sendQuote()` only flipped on a THROW. So whether a bare `await helper()` is a
   defect depends entirely on the helper's contract — and the tool can read it.

   throws   — has a `throw` on a failure path: a surrounding try/catch is real.
   softFail — can hand back a failure WITHOUT throwing (`return null`,
              `return false`, `return { …error/ok:false/sent:false… }`).
   Both at once is common and is exactly the trap: fantahair's `enqueueEmail()`
   throws when the queue write fails and returns null when a marketing gate skips
   the send, so the same call is handled on one path and a lie on the other. */
/* COVERAGE. A "0 rows" line is not evidence on its own - the name-keyed version
   of this tool reported 0 on store.ts because it had swept NOTHING there. Every
   statement that reaches the "is the outcome read?" test is counted, and the
   count is printed beside the findings so a zero can be read as "swept N, found
   none" rather than as "found none". */
const SWEPT = { statements: 0, files: new Set() };

const FILES = new Map();                 // path -> { raw, code, frames, depthAt }
const CALLEES = new Map();               // name -> { throws, softFail, file }
const load = (file) => {
  let v = FILES.get(file);
  if (!v) {
    const src = fs.readFileSync(file, "utf8");
    const code = mask(src).split(/\r?\n/);
    const st = structure(code);
    v = { raw: src.split(/\r?\n/), code, src, frames: st.frames, depthAt: st.depthAt };
    FILES.set(file, v);
  }
  return v;
};
const FN_DEF = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:function\s*)?\(|^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/;
const SOFT_FAIL = /\breturn\s+(?:null|false|undefined)\s*;|\breturn\s*\{[^}]*\b(error|ok|sent|success|failed|reason|skipped)\b\s*:/;
function indexCallees(file) {
  const { code, depthAt } = load(file);
  for (let i = 0; i < code.length; i++) {
    const m = FN_DEF.exec(code[i]);
    if (!m) continue;
    const name = m[1] || m[2];
    if (!name || CALLEES.has(name)) continue;
    // Find where the BODY opens. `export const enqueueEmail = async (` spreads its
    // parameters over eight lines at brace-depth 0, so "first line back at the
    // opening depth" lands inside the parameter list and reads a 3-line body with
    // no `throw` in it — which silently un-indexed every helper in the repo.
    let bodyStart = -1;
    for (let j = i; j + 1 < code.length && j < i + 40; j++) if (depthAt[j + 1] > depthAt[i]) { bodyStart = j + 1; break; }
    if (bodyStart < 0) continue;
    let end = code.length - 1;
    for (let j = bodyStart; j < code.length; j++) if (depthAt[j] <= depthAt[i]) { end = j; break; }
    const body = code.slice(i, Math.min(end + 1, i + 400)).join("\n");
    if (!/\bawait\b|\breturn\b|\bthrow\b/.test(body)) continue;
    CALLEES.set(name, { throws: /\bthrow\b/.test(body), softFail: SOFT_FAIL.test(body), file });
  }
}
const CALLEE_NAME = /^\s*(?:(?:const|let|var)\b[^=]*=\s*)?(?:void\s+)?await\s+([A-Za-z_$][\w$]*)\s*\(/;

function scanFile(file) {
  const { raw, code, frames, src } = load(file);
  if (!/await\s/.test(src)) return [];
  const isServer = /(\bapi\b|route\.[tj]sx?$|supabase[\\/]functions|server|worker|cron|handler)/i.test(file);
  // Resolve THIS FILE's clients before classifying anything in it. `svc`, `db`
  // and `admin` are clients here if this file made them one; the name is not
  // the evidence.
  const clients = resolveClients(code);
  const tierA = tierAFor(clients);
  const rows = [];

  for (let i = 0; i < code.length; i++) {
    const line = code[i];
    if (!/\bawait\b/.test(line)) continue;

    const bare = /^\s*(?:void\s+)?await\s+\S/.test(line);
    const decl = /^\s*(?:const|let|var)\b[^=]*=\s*await\s+\S/.test(line);
    if (!bare && !decl) continue;
    const prev = code.slice(0, i).reverse().find((l) => l.trim().length);
    if (bare && prev && CONTINUATION.test(prev.trim())) continue;

    const stmt = statementAt(code, i);
    const rawStmt = raw.slice(i, stmt.end + 1).join(" ").replace(/\s+/g, " ");
    const kind = classify(stmt.text, tierA);
    if (!kind) continue;
    // A `.from(...).select(...)` carries no mutating verb by construction, so the
    // MUTATING gate would drop every one of them. It is still a swept statement
    // (a dropped read that a claim then asserts on is the same shape), it just
    // stays Tier B and needs a success claim to earn a row.
    if (!MUTATING.test(stmt.text) && kind.label !== "postgrest read") continue;
    SWEPT.statements++;
    SWEPT.files.add(file);

    // --- is the outcome read?
    let mode = null;
    if (bare) {
      mode = "dropped";
    } else {
      const parts = destructured(stmt.text);
      const winEnd = Math.min(frameOf(frames, i, code.length - 1), stmt.end + OPT.window);
      if (parts) {
        const err = parts.find((b) => /^(error|err|e)$/i.test(b.src));
        if (!err) mode = "no error binding";
        else if (!referenced(code, err.name, stmt.end + 1, winEnd)) mode = `\`${err.name}\` bound, never read`;
      } else {
        const id = plainBinding(stmt.text);
        if (id && !referenced(code, id, stmt.end + 1, winEnd)) mode = `\`${id}\` bound, never read`;
      }
    }
    if (!mode) continue;

    // --- does a success claim follow?
    const fnEnd = frameOf(frames, i, code.length - 1);
    const to = Math.min(fnEnd, stmt.end + OPT.window);
    const claim = successClaim(raw, stmt.end + 1, to, isServer);
    const destr = destructiveFollow(code, stmt.end + 1, to);

    const above = raw.slice(Math.max(0, i - 3), i + 1).join(" ");
    const bestEffort = BEST_EFFORT.test(above) || DECLARED_ASYNC.test(stmt.text);
    const telemetry = TELEMETRY.test(targetName(rawStmt));

    /* `rpc(...)` and `functions.invoke(...)` are ambiguous — plenty of them only
       READ. Without a success claim they are advisory, not a finding. A
       `.insert()/.update()/.delete()/send()` is unambiguously a mutation. */
    const unambiguous = UNAMBIGUOUS_WRITE.test(stmt.text);
    const isSend = SEND_SHAPED.test(stmt.text) || /^send-|notif|email|alert/i.test(targetName(rawStmt));
    let sev;
    // A refused copy followed by a real delete is the worst row this tool emits.
    if (destr && /insert|upsert|update/i.test(stmt.text)) sev = "critical";
    // = Telemetry DOMINATES the claim. fantahair writes `email_send_log` and then
    //   answers 200 - deliberately. Ranking those critical is the naive-grep
    //   failure: it buries the six rows that are actually about the user's money.
    else if (telemetry) sev = "low";
    // An explicit "I know" — a `background()`/`waitUntil()` wrapper or a
    // best-effort comment — caps the row at high. It is still worth a look
    // (SentinelBox's swallowed send was deliberate too) but it is not a lie.
    else if (bestEffort) sev = "high";
    // "no error binding" means the destructure omitted `error` while still
    // reading `data` - the caller may be inferring failure from a null. fantahair
    // guards exactly that way (`if (!customerId) throw`). Only a SEND, whose
    // outcome IS the error, stays critical on this weaker sub-detector.
    else if (mode === "no error binding" && !isSend) sev = "high";
    else if (claim && claim.strength === "strong") sev = "critical";
    // Weak evidence reaches critical only when the dropped call IS the thing the
    // handler is answering for - a send. That is the SentinelBox 200-on-a-401 shape.
    else if (claim) sev = isSend ? "critical" : "high";
    else if (kind.tier === "B") continue;
    else if (bestEffort || !unambiguous) sev = "low";
    else sev = "high";

    /* Resolve the callee's contract when it is a function this repo defines. A
       helper whose ONLY failure exit is a throw really is caught by the try/catch
       around it — demote. A helper that can hand back a failure without throwing
       is the Petal shape: it stays where it is, with the reason named so the
       reader knows which file to open. */
    const cn = CALLEE_NAME.exec(stmt.text);
    const contract = cn ? CALLEES.get(cn[1]) : null;
    let contractNote = null;
    if (contract) {
      const where = path.relative(root, contract.file).replace(/\\/g, "/");
      if (contract.softFail && contract.throws) {
        // Both exits. fantahair's enqueueEmail() throws when the queue write
        // fails and returns null when a marketing gate SKIPS the send, so the
        // same call is handled on one path and a lie on the other. Which one you
        // are on depends on the arguments — only a human reading the helper can
        // say, so this ranks high with the contract named, never critical.
        contractNote = `local \`${cn[1]}()\` BOTH throws and can return a failure without throwing — read ${where} to see which path this call is on`;
        if (sev === "critical" && destr === null) sev = "high";
      } else if (contract.softFail)
        contractNote = `local \`${cn[1]}()\` can return a failure WITHOUT throwing — a try/catch will not see it (${where})`;
      else if (contract.throws) {
        contractNote = `local \`${cn[1]}()\` throws on failure — a surrounding try/catch does handle it (${where})`;
        if (sev === "critical" && destr === null) sev = "high";
      }
    }

    rows.push({
      file: path.relative(root, file).replace(/\\/g, "/"),
      line: i + 1,
      severity: sev,
      detector: bare ? "D1 dropped return" : "D2 unread outcome",
      what: kind.label,
      mode,
      target: targetName(rawStmt) || null,
      statement: rawStmt.slice(0, 130),
      claim: claim ? { line: claim.line + 1, label: claim.label, strength: claim.strength, text: claim.text.slice(0, 100) } : null,
      destructiveFollowUp: destr !== null ? destr + 1 : null,
      note: [telemetry ? "telemetry-shaped target" : null, bestEffort ? "declared best-effort" : null, contractNote].filter(Boolean).join("; ") || null,
    });
  }
  return rows;
}

/* ======================================================= 4b. SELF-CALIBRATION
   `calibrated-check` step 2 to 4, built into the tool so it is run rather than
   asserted. The control plants THE EXACT DEFECT under THREE DIFFERENT BINDING
   NAMES, none of them spelled `supabase`, reached by three different resolution
   routes (a local `: SupabaseClient` factory, a direct createClient assignment,
   a type annotation). All three MUST come back critical. A NEGATIVE CONTROL
   plants the same statement WITH `const { error } = ...; if (error) ...` and
   MUST come back zero.

   If either control fails, this exits NON-ZERO and refuses to report, because a
   sweep whose own defect does not fire is not evidence of a clean tree. This is
   the failure that shipped: the name-keyed version was green on store.ts and had
   simply never looked at it. */

const FIXTURES = {
  "defect/a-svc-binding.ts": `
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SITE_REPORTS_TABLE = "site_reports";

let cached: SupabaseClient | null = null;
function service(): SupabaseClient | null {
  if (cached) return cached;
  cached = createClient(process.env.URL as string, process.env.KEY as string);
  return cached;
}

export async function putBack(reportId: string) {
  const svc = service();
  if (!svc) return;
  await svc
    .from(SITE_REPORTS_TABLE)
    .update({ status: "queued", failure_code: null })
    .eq("id", reportId)
    .eq("status", "failed");
  return { ok: true, message: "The report was put back in the queue." };
}
`,
  "defect/b-db-binding.mjs": `
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.URL, process.env.KEY);

export async function markDelivered(jobId) {
  await db.from("fulfillment_jobs").update({ status: "delivered" }).eq("id", jobId);
  toast({ title: "Delivered", description: "The job was marked delivered." });
}
`,
  "defect/c-admin-binding.ts": `
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "./client";

export async function archiveRun(runId: string) {
  const admin: SupabaseClient = getServiceClient();
  await admin
    .from("runs")
    .update({ archived: true })
    .eq("id", runId);
  setArchiveConfirmed(true);
}
`,
  "control/read-and-branch.ts": `
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SITE_REPORTS_TABLE = "site_reports";

let cached: SupabaseClient | null = null;
function service(): SupabaseClient | null {
  if (cached) return cached;
  cached = createClient(process.env.URL as string, process.env.KEY as string);
  return cached;
}

export async function putBack(reportId: string) {
  const svc = service();
  if (!svc) return;
  const { error } = await svc
    .from(SITE_REPORTS_TABLE)
    .update({ status: "queued", failure_code: null })
    .eq("id", reportId)
    .eq("status", "failed");
  if (error) return { ok: false, detail: error.message };
  return { ok: true, message: "The report was put back in the queue." };
}
`,
};

function runCalibration() {
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ois-calibrate-"));
  const self = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  let failed = false;
  try {
    for (const [rel, body] of Object.entries(FIXTURES)) {
      const p = path.join(scratch, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, body.trimStart(), "utf8");
    }
    const run = (dir, min) => JSON.parse(
      execFileSync(process.execPath, [self, path.join(scratch, dir), "--json", "--min", min], { encoding: "utf8" })
    );

    console.log("outcome-integrity-sweep SELF-CALIBRATION");
    console.log(`scratch: ${scratch}`);
    console.log(`source:  ${here}\n`);

    const bad = run("defect", "critical");
    console.log("POSITIVE CONTROL - the same bare write under three binding names, none of them `supabase`:");
    for (const r of bad.rows)
      console.log(`  [${r.severity.toUpperCase()}] ${r.file}:${r.line}  ${r.what}  (outcome: ${r.mode}; claim at :${r.claim ? r.claim.line : "none"})`);
    const names = new Set(bad.rows.map((r) => r.file));
    const posOk = bad.rows.length === 3 && names.size === 3;
    console.log(`  => ${bad.rows.length} critical row(s) across ${names.size} file(s); EXPECTED 3 across 3 ... ${posOk ? "PASS" : "FAIL"}\n`);

    const good = run("control", "low");
    console.log("NEGATIVE CONTROL - the identical statement destructured into `{ error }` and branched on:");
    for (const r of good.rows) console.log(`  [${r.severity.toUpperCase()}] ${r.file}:${r.line}  ${r.what}  (${r.mode})`);
    const negOk = good.rows.length === 0;
    console.log(`  => ${good.rows.length} row(s) at --min low; EXPECTED 0 ... ${negOk ? "PASS" : "FAIL"}\n`);

    failed = !(posOk && negOk);
    console.log(failed
      ? "CALIBRATION FAILED. This sweep's own defect did not fire, so any green it reports is a rumour."
      : "CALIBRATION PASSED. The resolver keys on assignment and method shape, not on the name `supabase`.");
  } finally {
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* scratch already gone */ }
  }
  process.exit(failed ? 1 : 0);
}

if (OPT.calibrate) runCalibration();

/* ================================================================= 5. DRIVE */

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(path.join(dir, e.name), acc); }
    else if (CODE_EXT.has(path.extname(e.name)) && !/\.(test|spec|d)\.[tj]sx?$/.test(e.name)) acc.push(path.join(dir, e.name));
  }
  return acc;
}

let files;
if (OPT.changed) {
  const out = execFileSync("git", ["-C", root, "diff", "--name-only", OPT.changed], { encoding: "utf8" });
  files = out.split(/\r?\n/).filter(Boolean).map((f) => path.join(root, f))
    .filter((f) => fs.existsSync(f) && CODE_EXT.has(path.extname(f)));
} else {
  files = walk(root);
}

for (const f of files) { try { indexCallees(f); } catch { /* unreadable file */ } }
const rows = files.flatMap((f) => { try { return scanFile(f); } catch { return []; } })
  .filter((r) => OPT.all || RANK[r.severity] >= (RANK[OPT.min] ?? 1))
  .sort((a, b) => RANK[b.severity] - RANK[a.severity] || a.file.localeCompare(b.file) || a.line - b.line);

const coverage = { statements: SWEPT.statements, files: SWEPT.files.size };
if (OPT.json) { console.log(JSON.stringify({ root, scanned: files.length, coverage, rows }, null, 2)); process.exit(0); }

console.log(`outcome-integrity-sweep — ${files.length} files under ${root}`);
console.log(`swept ${coverage.statements} awaited write/send statement(s) across ${coverage.files} file(s)`);
console.log(`${rows.length} row(s) at --min ${OPT.min}\n`);
for (const r of rows) {
  console.log(`[${r.severity.toUpperCase()}] ${r.file}:${r.line}  (${r.detector} · ${r.what})`);
  console.log(`    outcome: ${r.mode}`);
  console.log(`    stmt:    ${r.statement}`);
  if (r.claim) console.log(`    claims:  ${r.file}:${r.claim.line} ${r.claim.label} (${r.claim.strength}) — ${r.claim.text}`);
  if (r.destructiveFollowUp) console.log(`    ★ destructive follow-up at line ${r.destructiveFollowUp} — a refused copy, then a real delete`);
  if (r.note) console.log(`    note:    ${r.note}`);
  console.log();
}
const counts = rows.reduce((m, r) => ((m[r.severity] = (m[r.severity] || 0) + 1), m), {});
console.log(`critical ${counts.critical || 0} · high ${counts.high || 0} · low ${counts.low || 0}`);
process.exit(0);
