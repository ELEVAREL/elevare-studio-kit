# Salted PBKDF2 PIN / passphrase hashing with transparent legacy upgrade

**When to reach for it:** any client-side / offline auth where there is no server to hash on — a PIN, passphrase, or recovery code stored on disk or in local state. Gives you salted PBKDF2 (not naked SHA-256), constant-time compare, and a migration path that upgrades old unsalted hashes on the next successful login without locking anyone out.

**Assumes / adapt:**
- Runs in a browser / any Web Crypto (`crypto.subtle`) environment. In Node, use `crypto.webcrypto` or the `crypto.pbkdf2` API.
- Stored format is a single self-describing string: `pbkdf2$<iters>$<saltB64>$<hashB64>` — the iteration count and salt travel with the hash, so you can raise `iter` later without a schema change.
- `verifyHash` also accepts a legacy 64-hex SHA-256 string so pre-existing credentials keep working. **You** wire the upgrade: after a successful `verifyHash`, if `isLegacyHash(stored)`, re-hash with `hashPin` and persist. See the login snippet at the bottom.
- Tune `iter` (120k here) to the slowest device you support. Salt is 16 random bytes; derived key is 256 bits.
- This protects a stored secret against offline brute force; it is not a substitute for a real server-side auth boundary when one exists.

```js
// ---- base64 helpers for raw bytes ----
const _b64  = u8  => { let s=""; for (let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]); return btoa(s); };
const _b64d = str => { const s=atob(str), u=new Uint8Array(s.length); for (let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; };

// ---- constant-time string compare (avoids early-exit timing leak) ----
function _ctEq(a, b){ if (a.length !== b.length) return false; let d=0; for (let i=0;i<a.length;i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d===0; }

// ---- legacy fallback: plain SHA-256 hex (what the old code used) ----
async function _sha(s){ const b=await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }

// ---- PBKDF2 core ----
async function _pbkdf2Bits(secret, salt, iter){
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt, iterations:iter, hash:"SHA-256" }, k, 256);
  return _b64(new Uint8Array(bits));
}

// ---- public API ----
async function hashPin(secret){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iter = 120000;
  const h = await _pbkdf2Bits(secret, salt, iter);
  return "pbkdf2$" + iter + "$" + _b64(salt) + "$" + h;   // self-describing stored value
}

async function verifyHash(secret, stored){
  if (!stored) return false;
  if (stored.indexOf("pbkdf2$") === 0){
    const p = stored.split("$");                            // [ "pbkdf2", iter, saltB64, hashB64 ]
    const got = await _pbkdf2Bits(secret, _b64d(p[2]), +p[1]);
    return _ctEq(got, p[3]);
  }
  return _ctEq(await _sha(secret), stored);                 // legacy 64-hex SHA-256
}

function isLegacyHash(stored){ return !!stored && stored.indexOf("pbkdf2$") !== 0; }
```

**Transparent upgrade at the call site** (do this once, in your login/verify path):

```js
async function login(secret, record){
  if (!await verifyHash(secret, record.hash)) return false;
  if (isLegacyHash(record.hash)){          // seamless migration on next good login
    record.hash = await hashPin(secret);
    await persist(record);                 // your save fn
  }
  return true;
}
```
