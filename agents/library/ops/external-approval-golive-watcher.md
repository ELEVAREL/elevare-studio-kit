# External-approval go-live watcher (poll an external status, then auto-flip + redeploy + notify + self-remove)

**When to reach for it:** a launch is blocked on an **external party's approval you don't control** and can't be webhooked reliably — a Stripe account clearing review (`charges_enabled`), a domain finishing propagation, a marketplace app getting approved, an SSL cert issuing, a DNS/verification step completing. Instead of a human babysitting a dashboard and remembering to flip a config the day it clears, this is a **dependency-free local Node script** on a schedule that polls the external status, and the instant it's genuinely ready: flips the production config, redeploys, emails a themed confirmation, drops an idempotency marker, and **deletes its own scheduled task** so it never runs again. It fails safe — every run is idempotent, wrapped in try/catch, and always exits 0.

**Assumes / adapt:**
- **Windows + Node 24+ (built-in `fetch`), plus the tools it drives** (Vercel CLI authenticated to your team scope; a mail API like Resend for the notification). Adapt the scheduler command, the CLI calls, and the mail transport to your stack. Registered as a Windows Scheduled Task (`schtasks /Create ... /SC HOURLY /MO 2`) by a human — the script does **not** schedule itself, only *unschedules* itself on success.
- **The run sequence is the pattern — copy the order:**
  1. **Idempotency guard first.** If the marker file exists, log and exit. Nothing else runs.
  2. **Load secrets ephemerally.** Pull keys from a local vault into a **throwaway temp dir**, parse, and `fs.rmSync` it in a `finally`. Never log key *values*.
  3. **Poll the external status** (`GET` the provider). If not ready (`charges_enabled !== true`), log "pending" and exit — this is the common path and must be cheap and silent.
  4. **Prove the capability, don't just trust the flag.** Being "approved" isn't the same as "the key can actually do the thing." Here it creates a real $1.00 Checkout Session as a probe, then best-effort expires it. A **permissions** failure (403 / "does not have access") means approved-but-misconfigured → email an *action-needed* note and **do not flip**. This distinction (ready vs. ready-but-key-underscoped) is the subtle bug this catches.
  5. **Flip + deploy** only when status is ready AND the capability probe passed: set the prod env var (`vercel env add ... --force`, value via stdin) and `vercel deploy --prod --yes`.
  6. **Notify** with a themed HTML+plaintext email (asking for one real end-to-end test — the script deliberately never auto-charges a real customer).
  7. **Marker + self-remove.** Write the marker file, then `schtasks /Delete` its own task.
- **Fail-safe discipline (the reason it can run unattended):** a `log()` helper that never throws (timestamped line to a logfile + stdout); every network/CLI call in its own try/catch that logs and returns without flipping (so a transient failure just retries next run — no marker means retry); a top-level `try/catch` that logs `FATAL` and still exits 0; and a `setTimeout(() => process.exit(0), 300)` at the end (on Node 24/Windows, calling `process.exit(0)` synchronously races undici's keep-alive socket teardown and trips a libuv `UV_HANDLE_CLOSING` assertion — the short ref'd timer lets sockets close first).
- **Only three states ever email you:** success (flipped + live), approved-but-key-underscoped (action needed), and unexpected error (will retry). "Still pending" stays silent so a task running every 2 hours for a week doesn't spam.
- **Reference:** `D:\precisionaim\scripts\stripe-golive-watch.mjs` — the full, commented implementation (Stripe `charges_enabled` → flip `PAYMENT_PROVIDER=stripe`). It reads keys from the machine's DPAPI key vault (`~\.keyvault\keyvault.ps1 apply <dir>`); swap that for your own secret source.

## Skeleton (adapt the poll, the probe, and the flip)

```js
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execSync } from 'node:child_process';

const MARKER = 'D:\\myproject\\.golive-done';
const LOG    = 'D:\\myproject\\scripts\\golive-watch.log';
const TASK   = 'MyProject-GoLiveWatch';

function log(m){ const l=`[${new Date().toISOString()}] ${m}`; try{ fs.appendFileSync(LOG,l+'\n'); }catch{} console.log(l); }

async function main(){
  if (fs.existsSync(MARKER)) { log('already live — marker present'); return; }   // (1) idempotent

  const keys = readVaultKeys();                                                   // (2) ephemeral secrets
  const apiKey = keys.PROVIDER_KEY, mailKey = keys.RESEND_API_KEY;
  if (!apiKey) { log('provider key missing — exiting'); return; }

  const status = await getExternalStatus(apiKey);                                 // (3) poll
  if (!status.ready) { log('pending'); return; }                                  //     common path: silent exit

  const probe = await proveCapability(apiKey);                                    // (4) approved != capable
  if (probe.permissionError) { await email(mailKey, actionNeededTemplate()); return; }
  if (probe.error)          { await email(mailKey, errorTemplate(probe.error)); return; }

  try {                                                                           // (5) flip + deploy
    execSync(`vercel env add MY_FLAG production --scope myteam --force`, { input: 'on', cwd: 'D:\\myproject', shell: true });
    execSync(`vercel deploy --prod --yes --scope myteam`, { cwd: 'D:\\myproject', shell: true });
  } catch (e) { await email(mailKey, errorTemplate(String(e))); return; }         // no marker → retry next run

  await email(mailKey, successTemplate());                                        // (6) notify (ask for 1 real test)
  fs.writeFileSync(MARKER, new Date().toISOString());                             // (7) marker…
  try { execSync(`schtasks /Delete /TN "${TASK}" /F`, { shell: true, stdio: 'ignore' }); } catch {}  // …self-remove
}

// ephemeral secret load: apply vault → temp dir → parse KEY=VALUE → wipe in finally
function readVaultKeys(){
  const dir = path.join(os.tmpdir(), 'kv-'+process.pid);
  try { fs.mkdirSync(dir,{recursive:true});
    execSync(`powershell -ExecutionPolicy Bypass -File "${VAULT_PS1}" apply "${dir}"`, { stdio:'ignore' });
    const raw = fs.readFileSync(path.join(dir,'.env.local'),'utf8'); const out={};
    for (const line of raw.split(/\r?\n/)){ const i=line.indexOf('='); if(i>0) out[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^["']|["']$/g,''); }
    return out;
  } catch(e){ log('vault read failed'); return {}; }
  finally { try{ fs.rmSync(dir,{recursive:true,force:true}); }catch{} }           // secrets never linger on disk
}

try { await main(); }
catch (e) { log('FATAL (caught, exit 0) — ' + (e?.message||e)); }
finally { setTimeout(() => process.exit(0), 300); }   // let undici sockets close (Node24/Windows UV_HANDLE_CLOSING)
```

**The two mistakes this design prevents:** (a) flipping to live the moment the account is *approved* but before the *key* can actually transact — you'd ship a broken checkout and only find out from an angry customer; the capability probe catches it and emails a precise fix instead. (b) an unattended script that throws on a transient network blip and either spams failure emails or dies — every path here logs, exits 0, and simply retries next tick, and only the three meaningful outcomes ever reach your inbox.
