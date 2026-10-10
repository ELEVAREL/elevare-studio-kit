# Verified in-app self-update (streamed download → sha256 fail-closed → os.replace → exit-hook self-quit)

**When to reach for it:** a packaged desktop app (frozen `.exe`, or any app that holds locks on its own files) that must **update itself in place** — "a new version is available → download & install without the user hunting for a link." The naive flow always fails: the installer hits the still-running app's locked files and dies. Pairs with [`pywebview-pyinstaller-boilerplate.md`](pywebview-pyinstaller-boilerplate.md) (the app being updated) and [`windows-peruser-installer-uninstaller.md`](windows-peruser-installer-uninstaller.md) (the installer it launches); the version feed + gated download come from [`../buy-once-fulfillment/stripe-buyonce-fulfillment.md`](../buy-once-fulfillment/stripe-buyonce-fulfillment.md).

**Assumes / adapt:**
- **A version endpoint that returns `{version, notes, sha256}`.** The public check compares `version` tuples; the `sha256` is non-negotiable (see fail-closed below). Adapt the URL and field names.
- **Download to `.part`, hash as you stream, THEN `os.replace`.** Never write the final filename until the bytes are verified — a half-downloaded `Update.exe` you might later launch is a live hazard. `os.replace` is atomic on the same volume; keep the temp file beside the target.
- **Fail closed on a missing/empty checksum.** If the version feed returns no `sha256`, **refuse to install** — you cannot prove the executable you're about to launch and self-replace with is the release you intended. A missing checksum is a broken or hostile feed, not an old server. This is the single most important line in the file.
- **Exit-hook self-quit, delayed ~2s.** The app can't be replaced while it holds its files. On a verified download, a `threading.Timer(2.0, ...)` fires registered exit hooks (the shell registers one that sets uvicorn `should_exit` + destroys the window) so the process — and its locks — are gone by the time the installer copies files. The 2s delay lets the HTTP response for `POST /api/update/apply` reach the UI first. A bare/dev run with no hook logs "close the app manually" instead of pretending it restarted.
- **Timeouts on every network call.** `urllib.request.urlopen(..., timeout=30)` — `urlretrieve` has none, so a stalled CDN hangs the request thread forever. The download follows the 307 to a signed storage URL (the gated-download pattern).
- **Updates are for everyone; the download is gated by license only for logging.** Activated copies pass `?key=` so the update is logged against the license; trial/free copies use the public path. Don't gate *getting the update* behind payment — gate the *features*, which the signed-token licensing already does.

## The load-bearing sequence (`apply()`)
```python
expected = (_fetch_version_info().get("sha256") or "").strip().lower()
digest = hashlib.sha256()
with urllib.request.urlopen(dl, timeout=30) as r, open(part, "wb") as f:
    while (chunk := r.read(_CHUNK)):
        f.write(chunk); digest.update(chunk)

if not expected:                      # ← FAIL CLOSED: no checksum = refuse
    part.unlink(missing_ok=True); return {"ok": False, "error": "no checksum — update skipped"}
if digest.hexdigest().lower() != expected:
    part.unlink(missing_ok=True); return {"ok": False, "error": "download corrupted — will retry"}

os.replace(part, dest)                # atomic promote of the verified file
subprocess.Popen([str(dest)], creationflags=CREATE_NO_WINDOW)
threading.Timer(2.0, _shutdown_for_update).start()   # quit so files unlock
```

**Related hardening (from the same run):** the reference notes a LOW open item — *code-sign the downloaded installer and verify its Authenticode signature before `Popen`*, in addition to the sha256. sha256 proves integrity-vs-the-feed; a signature proves origin. Do both for a shipped product.

**Source (verified round-trip vs the live hub):** `D:\SentinelBox\engine\backend\app\updates.py` — the whole `check()` / `apply()` / `register_exit_hook()` flow, with the fail-closed comment block intact.
