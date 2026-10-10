# Secure-context boot guard (Web Crypto / File System Access apps)

**When to reach for it:** any offline/native-feeling app that relies on `crypto.subtle` (PBKDF2/AES/HMAC/SHA) or other secure-context-only APIs. These are **unavailable on a plain `http://` origin** — so a user who serves the folder over `http://localhost:XXXX` (or a LAN IP) instead of opening it as `file://` or over `https://` gets a cryptic `Cannot read properties of undefined (reading 'importKey')` the moment they try to log in. Detect the condition at boot and show one clear, actionable full-screen message instead.

**Assumes / adapt:**
- Runs at `DOMContentLoaded`, **before** any code touches `crypto.subtle`. If the check fails, render the message and `return` — do not continue booting.
- The test is `!window.isSecureContext || !(window.crypto && crypto.subtle)`. `file://` and `https://` are secure contexts; `http://` (other than `localhost` in some browsers) is not. Belt-and-suspenders: also null-check `crypto.subtle` directly, since some locked-down/embedded browsers strip it even in a nominally secure context.
- Tell the user **how to fix it**, in their terms: double-click the HTML to open it as `file://` (the normal path for a zero-server app), or host over `https://`. Name supported browsers if the app uses APIs with narrow support (File System Access → Chromium 111+; Firefox/Safari lack it).
- This is the sibling of the **missing-program-file boot self-check** (see [`lazy-load-vendor-libs.md`](lazy-load-vendor-libs.md) "clear failure messaging") — both turn a silent/cryptic failure into a plain-language recovery instruction at startup. Style the panel with inline CSS so it renders even if the app's stylesheet failed to load.

```js
window.addEventListener("DOMContentLoaded",()=>{
  // Web Crypto (crypto.subtle) is unavailable on a plain http:// origin. Without this guard, a user
  // who serves the folder over http:// hits a cryptic "cannot read importKey of undefined" on login.
  if(!window.isSecureContext || !(window.crypto && crypto.subtle)){
    document.body.innerHTML =
      '<div style="max-width:560px;margin:12vh auto;padding:26px;background:#141414;'+
      'border:1px solid #c9a227;border-radius:12px;color:#eee;font:15px sans-serif">'+
        '<h2 style="color:#c9a227;margin-top:0">This app needs a secure connection</h2>'+
        '<p>It uses browser encryption, which is turned off on plain <code>http://</code> addresses.</p>'+
        '<p><b>To fix it, open it one of these ways:</b></p>'+
        '<ul>'+
          '<li><b>Double-click the app\'s HTML file</b> to open it directly '+
          '(a <code>file://</code> address — the normal way), or</li>'+
          '<li>Host it over <b>https://</b>.</li>'+
        '</ul>'+
        '<p style="color:#999">Use <b>Chrome</b> or <b>Microsoft Edge</b> (version 111 or newer). '+
        'Firefox and Safari are not supported for File System Access apps.</p>'+
      '</div>';
    return;   // stop booting — nothing else will work anyway
  }
  // ...normal boot continues here...
});
```
