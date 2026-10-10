# go2rtc + ffmpeg live-streaming sidecar (sub-second camera/live video in a Python app)

**When to reach for it:** you need to show **live video** (IP cameras, RTSP, an on-machine capture) in a Python app's web UI with sub-second latency, and you don't want to reinvent WebRTC/MSE. Bundle the single-binary [go2rtc](https://github.com/AlexxIT/go2rtc) + ffmpeg as a **supervised sidecar**: it pulls each RTSP/HTTP source once and re-streams it to the browser (WebRTC/MSE) and to your own code (JPEG frames for AI/thumbnails). This is the recipe for "add live view to any local Python app" — an NVR, a camera dashboard, a kiosk, a robotics/vision UI.

**Assumes / adapt:**
- **go2rtc is the single source of truth per stream.** It ingests each camera once (browser + AI share it — you don't open 3 RTSP connections to one camera). You generate its config from your camera list and (re)start it when the list changes. Adapt `build_config()`'s stream dict to your source model.
- **Config is generated, not hand-written.** `json.dumps(cfg)` — **JSON is valid YAML**, so you emit go2rtc's YAML config with zero yaml dependency and correct URL escaping. Keep that trick.
- **Everything binds to loopback** (`127.0.0.1`) — nothing is exposed off the machine. WebRTC needs its own port + a loopback candidate. If you ever expose it, revisit the `api.origin:"*"` and candidate host.
- **Kill stragglers on start.** A crashed parent leaves a go2rtc holding the fixed API port; a stale config keeps answering. `taskkill /IM go2rtc.exe /F` (Win) / `pkill -f go2rtc` before binding. This is the #1 "why is it serving the old cameras" bug.
- **Same-origin frame proxy dodges CORS.** Don't point the browser at go2rtc's port directly for snapshots — proxy `GET /api/streams/{id}/frame.jpg` through your own FastAPI (same origin, `Cache-Control: no-store`, a real timeout on go2rtc's slow first keyframe). MSE/WebRTC `<video>` can hit go2rtc directly; snapshot-poll is the headless-renderable fallback and the one that needs the proxy.
- **Bundled-binary path resolution** must handle frozen (`sys._MEIPASS/bundled`) vs dev (`repo_root/bundled`) — see the `_bundled_dir()` / `_exe()` helpers. Pairs with `desktop-native-app/pywebview-pyinstaller-boilerplate.md` (ship go2rtc.exe + ffmpeg.exe via the spec's `datas` bundled dir).
- **Security:** only ever hand go2rtc a real network scheme (`rtsp/rtsps/http/https`). An `exec:`/`ffmpeg:` source means "run this command" — if any stream URL can come from a request/DB, that's RCE. See `local-media-ai/loopback-api-rce-csrf-guard.md`.

**Reference:** `D:\SentinelBox\engine\backend\app\streams\go2rtc_manager.py` (the manager: build_config / start / reload / kill_stragglers / probe) + `engine\backend\app\api\streams.py` (status endpoint that hands the UI `mse_url`/`webrtc_url`/proxied `snapshot_url`, and the frame proxy route).

## The load-bearing pieces

**Generate go2rtc config from your cameras (JSON-as-YAML), loopback-only:**
```python
def build_config(self) -> dict:
    streams = {}
    for cam in camera_repo.stream_sources():
        url = cam["url"]
        if url.startswith(("rtsp://", "rtsps://", "http://", "https://")):
            streams[f"cam_{cam['id']}"] = url          # never exec:/ffmpeg: from data
    return {
        "log": {"level": "warn"},
        "api":  {"listen": "127.0.0.1:1984", "origin": "*"},
        "rtsp": {"listen": "127.0.0.1:8554"},
        "webrtc": {"listen": ":8555", "candidates": ["127.0.0.1:8555"]},
        "ffmpeg": {"bin": str(_exe("ffmpeg"))},
        "streams": streams,
    }
# JSON is valid YAML — write it directly, no yaml dep:
self._config_path().write_text(json.dumps(cfg, indent=2), encoding="utf-8")
```

**Launch + supervise, killing stragglers first:**
```python
def start(self) -> bool:
    if self.is_running() or not self.available(): return self.is_running()
    cfg = self._write_config()
    if not cfg["streams"]: return False          # nothing to serve yet
    self._kill_stragglers()                       # stale go2rtc holds the fixed port
    env = dict(os.environ)
    env["PATH"] = str(_bundled_dir()) + os.pathsep + env.get("PATH", "")
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    self._proc = subprocess.Popen(
        [str(_exe("go2rtc")), "-config", str(self._config_path())],
        cwd=str(_bundled_dir()), env=env, creationflags=flags,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True

def reload(self):  # camera changes take effect
    self.stop(); self.start()
```

**Same-origin JPEG proxy (feeds live preview + is headless-testable):**
```python
@router.get("/{camera_id}/frame.jpg")
def frame(camera_id: int) -> Response:
    url = f"{manager.api_base()}/api/frame.jpeg?src={manager.stream_name(camera_id)}"
    try:
        with urllib.request.urlopen(url, timeout=8) as r:
            return Response(content=r.read(), media_type="image/jpeg",
                            headers={"Cache-Control": "no-store"})
    except OSError:
        return Response(status_code=503)
```

**Stream URLs the UI plays** (from `/status`): `mse_url = {base}/api/stream.mp4?src={name}` (MSE, works everywhere), `webrtc_url = {base}/webrtc.html?src={name}` (sub-second), `snapshot_url = /api/streams/{id}/frame.jpg` (your proxied fallback). Probe `GET {base}/api/streams` to know which streams are actually producing (`online: name in probe`).
