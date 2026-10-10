# Loopback-API RCE + CSRF guard (defense for any local/127.0.0.1 API that shells out or feeds an interpreter)

**When to reach for it:** you're shipping a **local/loopback HTTP API** — a desktop app's engine, a dev tool, a localhost agent — that (a) takes URLs/paths/commands that get handed to a subprocess, an interpreter, or a config-driven binary, and/or (b) is **unauthenticated** because "it's only on 127.0.0.1." Both assumptions are traps. This is the two-part defense: an **input scheme allowlist** (stops RCE via crafted stream/source URLs) + a **`Sec-Fetch-Site` CSRF middleware** (stops a web page the user visits from POSTing to your loopback API).

**Assumes / adapt:**
- **"Loopback = safe" is false for CSRF.** A random website the user visits can issue `fetch('http://127.0.0.1:PORT/api/...', {method:'POST'})`. CORS does **not** stop the request from *executing* — it only stops the page from *reading the response*. So any state-changing loopback endpoint is CSRF-reachable. The fix costs ~8 lines.
- **The `Sec-Fetch-Site` check** is the cheap, robust CSRF defense here: browsers tag cross-origin requests `Sec-Fetch-Site: cross-site`; your bundled same-origin UI sends `same-origin`. Reject cross-site mutations (POST/PUT/PATCH/DELETE). Supported in all evergreen browsers; a same-origin desktop UI never trips it. (For a token-authed public API you'd use CSRF tokens instead — this pattern shines for the *unauthenticated loopback* case.)
- **Scheme allowlist stops config-driven RCE.** Tools like go2rtc/ffmpeg/yt-dlp treat a source by its prefix — `exec:`, `ffmpeg:`, `file:` can mean "run this" or "read arbitrary files." If a URL can arrive from a request (or a DB row that a request wrote), validate it against a **positive allowlist** of network schemes at the Pydantic boundary. Reject everything else with a clear message. Apply it on **create and update**. Adapt `_ALLOWED_URL_SCHEMES` to your interpreter's dangerous prefixes.
- **Defense in depth:** re-check the scheme again at the point you actually hand the value to the subprocess (don't trust that only the API ever wrote the DB). See the `startswith((...))` re-filter in `build_config()` of `local-media-ai/go2rtc-live-streaming-sidecar.md`.
- **Pairs with:** the go2rtc streaming pattern (the RCE vector it defends) and the desktop packaging boilerplate (which produces the loopback engine).

**Reference:** `D:\SentinelBox\engine\backend\app\models.py` (`_validate_stream_url` + field validators on create/update) and `engine\backend\app\main.py` (the `_block_cross_site_mutations` middleware).

## The load-bearing pieces

**1. Scheme allowlist at the Pydantic boundary (blocks `exec:`/`ffmpeg:`/`file:` RCE):**
```python
_ALLOWED_URL_SCHEMES = {"rtsp", "rtsps", "http", "https"}   # adapt to your consumer

def _validate_stream_url(v):
    if not v: return v
    scheme = v.split("://", 1)[0].lower().strip() if "://" in v else ""
    if scheme not in _ALLOWED_URL_SCHEMES:
        raise ValueError("url must start with rtsp://, rtsps://, http:// or https:// "
                         "(command schemes like exec:/ffmpeg: are rejected)")
    return v

class CameraCreate(BaseModel):
    rtsp_url: Optional[str] = None
    @field_validator("rtsp_url")
    @classmethod
    def _check(cls, v): return _validate_stream_url(v)     # AND on CameraUpdate too
```

**2. Sec-Fetch-Site CSRF middleware (blocks cross-site mutations to a loopback API):**
```python
@app.middleware("http")
async def _block_cross_site_mutations(request, call_next):
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if request.headers.get("sec-fetch-site") == "cross-site":
            from starlette.responses import JSONResponse
            return JSONResponse({"error": "Cross-site request blocked"}, status_code=403)
    return await call_next(request)
```

**CORS is not this.** Keep CORS scoped to your local UI origins (`allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$"`) for dev, but understand it protects *response reads*, not *request execution* — the `Sec-Fetch-Site` middleware is what actually stops the CSRF write.
