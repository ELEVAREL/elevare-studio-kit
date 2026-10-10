#!/usr/bin/env node
/**
 * probe-credential.mjs — ask the PROVIDER whether a credential is good.
 *
 *   node probe-credential.mjs --provider meta   --token "$TOK" [--app-id ID --app-secret SEC]
 *   node probe-credential.mjs --provider stripe --token "$SK"
 *   node probe-credential.mjs --provider resend --token "$RE"
 *   node probe-credential.mjs --provider supabase-mgmt --token "$SBAT"
 *   node probe-credential.mjs --provider url --url "https://api.x/me" --token "$T"
 *
 * Prints validity, expiry and scopes where the provider exposes them. Never prints
 * the secret: only its length and last four characters, so two copies can be
 * compared across stores and hosts without either being disclosed.
 *
 * Exit 0  credential answered as VALID
 * Exit 1  credential answered as INVALID  (this is the only evidence that justifies
 *         saying "dead" to an owner)
 * Exit 2  could not tell — network, bad args, unknown provider. NOT evidence of
 *         anything. Say "could not test", never "expired".
 */

const argv = process.argv;
const arg = (n, d = null) => {
  const i = argv.indexOf(`--${n}`);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : d;
};

const provider = (arg("provider") || "").toLowerCase();
const token = arg("token");
if (!provider || !token) {
  console.error("usage: probe-credential.mjs --provider <meta|stripe|resend|supabase-mgmt|url> --token <value> [...]");
  process.exit(2);
}

const fingerprint = (t) => `len=${t.length} tail=...${t.slice(-4)}`;

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  let body;
  try { body = await res.json(); } catch { body = { _raw: await res.text().catch(() => "") }; }
  return { status: res.status, body };
}

function verdict(ok, lines) {
  console.log(`credential  ${fingerprint(token)}`);
  for (const l of lines) console.log(`  ${l}`);
  console.log(ok ? "\nVALID per the provider." : "\nINVALID per the provider.");
  console.log("Compare this against every OTHER store and host before concluding anything.");
  process.exit(ok ? 0 : 1);
}

try {
  if (provider === "meta") {
    const me = await getJson(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(token)}`);
    if (me.status !== 200) {
      const e = me.body?.error || {};
      verdict(false, [`GET /me -> ${me.status}`, `code=${e.code} ${e.message || ""}`]);
    }
    const lines = [`resolves to: ${me.body.name} (${me.body.id})`];
    const appId = arg("app-id"), appSecret = arg("app-secret");
    if (appId && appSecret) {
      const d = await getJson(
        `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}` +
        `&access_token=${encodeURIComponent(appId)}|${encodeURIComponent(appSecret)}`
      );
      const x = d.body?.data || {};
      lines.push(`type=${x.type}  is_valid=${x.is_valid}`);
      lines.push(`expires=${x.expires_at === 0 ? "never (long-lived)" : new Date((x.expires_at || 0) * 1000).toISOString()}`);
      lines.push(`scopes: ${(x.scopes || []).join(", ") || "(none reported)"}`);
      lines.push("^ READ THE SCOPES. A valid token missing a publish scope passes every liveness check and still cannot post.");
      if (x.is_valid === false) verdict(false, lines);
    } else {
      lines.push("(pass --app-id and --app-secret to see is_valid, expiry and scopes)");
    }
    verdict(true, lines);
  }

  if (provider === "stripe") {
    const r = await getJson("https://api.stripe.com/v1/account", { Authorization: `Bearer ${token}` });
    if (r.status !== 200) verdict(false, [`GET /v1/account -> ${r.status}`, r.body?.error?.message || ""]);
    verdict(true, [`account: ${r.body.id}`, `livemode fields present: ${Boolean(r.body.charges_enabled)}`]);
  }

  if (provider === "resend") {
    const r = await getJson("https://api.resend.com/domains", { Authorization: `Bearer ${token}` });
    if (r.status !== 200) verdict(false, [`GET /domains -> ${r.status}`, JSON.stringify(r.body).slice(0, 160)]);
    const n = (r.body?.data || r.body || []).length ?? "?";
    verdict(true, [`domains visible: ${n}`]);
  }

  if (provider === "supabase-mgmt") {
    const r = await getJson("https://api.supabase.com/v1/projects", { Authorization: `Bearer ${token}` });
    if (r.status !== 200) verdict(false, [`GET /v1/projects -> ${r.status}`, JSON.stringify(r.body).slice(0, 160)]);
    verdict(true, [`projects visible: ${Array.isArray(r.body) ? r.body.length : "?"}`]);
  }

  if (provider === "url") {
    const url = arg("url");
    if (!url) { console.error("--provider url needs --url"); process.exit(2); }
    const r = await getJson(url, { Authorization: `Bearer ${token}` });
    verdict(r.status >= 200 && r.status < 300, [`GET ${url} -> ${r.status}`, JSON.stringify(r.body).slice(0, 200)]);
  }

  console.error(`unknown provider: ${provider}`);
  process.exit(2);
} catch (e) {
  console.error(`COULD NOT TEST: ${e.message}`);
  console.error("This is NOT evidence the credential is bad. Report 'could not test', never 'expired'.");
  process.exit(2);
}
