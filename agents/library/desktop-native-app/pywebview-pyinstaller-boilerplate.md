# pywebview + PyInstaller desktop-packaging boilerplate (Python/FastAPI → installable Windows app)

**When to reach for it:** you have a working Python web app (FastAPI/Flask + an HTML/PWA front-end) and need to ship it as a **double-click Windows app** — its own window, tray icon, run-on-boot, single instance — **without adopting Electron, Tauri, Node, or Rust.** This is the verified recipe for wrapping an in-process web server in a WebView2 window and freezing the whole thing into one `.exe`. Reach for it any time "make my Python app installable on Windows" comes up.

**Assumes / adapt:**
- **Windows + WebView2.** `pywebview` uses the Edge WebView2 runtime (present on Win10/11). Cross-platform bits (singleton lock file, tray degrade) are stubbed but the packaging story here is Windows-only. Swap the app name, exe name, window size, and brand background everywhere marked.
- **The shell IS the engine — one process, no sidecar.** The desktop shell imports the FastAPI `app` object and runs uvicorn on a **daemon thread** in the same process. No second exe, no IPC, no fixed port. Adapt the import path (`from app.main import app`) to your engine.
- **Free-port → boot → health-gate → window** is the load-bearing sequence. Never hardcode a port (collides, and looks like a server). Ask the OS for a free loopback port, pass it to the engine via env **before its settings are cached**, then poll `/api/health` until 200 before pointing the window at it. Show a fallback error page if the engine never gets healthy.
- **Two-spec freeze.** `engine.spec` (onedir) freezes the app; `setup.spec` (onefile) freezes the installer and bundles the onedir app as its payload. `collect_all()` is required for `webview`, `pystray`, `PIL` (they load backends dynamically) and `collect_submodules("uvicorn")` for uvicorn's dynamically-imported loop/protocol impls — a hand-maintained `hiddenimports` list will miss them and the frozen app fails at runtime. **`collect_all(webview)` is necessary but NOT sufficient — verify the DLLs actually landed:** collectors silently drop non-linked native libs, so `webview/lib/*.dll` (the WebView2 backend) can still be absent from `dist/` even with `collect_all` in the spec (this shipped a v1.1.0 installer that hung with no window). Add them as explicit `datas`/`binaries` if the collector misses them, and always run the post-build `verify_build.py` check.
- **Per-user everything (no elevation).** Install to `%LOCALAPPDATA%\Programs\<App>`, autostart via `HKCU\...\Run`, `PrivilegesRequired=lowest`. Same reason Discord/VS Code install per-user — no UAC prompt. Only reach for admin install if you genuinely need a service.
- **Ship-hardening:** Authenticode-sign both `.exe`s before distribution or Windows SmartScreen will scare buyers. The optional Inno Setup wrapper (`installer.iss`) is the battle-tested path for Add/Remove-Programs + a real uninstaller — run it `/VERYSILENT` behind your own animated window.
- **Reference build:** `D:\SentinelBox\desktop\` — `shell/` (app.py, server.py, singleton.py, autostart.py, tray.py) + `packaging/` (engine.spec, setup.spec, build.ps1, installer.iss, sentinelbox_main.py). Copy those five shell modules and two specs, then rename. Pairs with the animated installer in [`animated-installer-statemachine.md`](animated-installer-statemachine.md).

## The load-bearing pieces

**1. Free loopback port + in-process engine on a daemon thread** (`server.py`):
```python
import os, socket, threading, time, urllib.request

def free_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0)); return s.getsockname()[1]

def start_engine(port: int):
    os.environ["APP_PORT"] = str(port)        # set BEFORE engine settings are cached
    import uvicorn
    from app.main import app                  # <-- your FastAPI instance
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port,
                                            reload=False, log_level="warning"))
    t = threading.Thread(target=server.run, daemon=True); t.start()
    return t, server

def wait_healthy(port: int, timeout: float = 25.0) -> bool:
    url = f"http://127.0.0.1:{port}/api/health"
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1.5) as r:
                if r.status == 200: return True
        except OSError:
            time.sleep(0.2)
    return False
```

**2. Boot → health-gate → window, hide-to-tray on close** (`app.py`):
```python
def main() -> int:
    if not singleton.acquire():           # named mutex; second launch just exits
        return 0
    port = server.free_loopback_port()
    server.start_engine(port)
    healthy = server.wait_healthy(port)
    import webview
    window = webview.create_window(
        "MyApp",
        url=(f"http://127.0.0.1:{port}/" if healthy else None),
        html=(None if healthy else ENGINE_ERROR_HTML),   # graceful fallback
        width=1180, height=760, min_size=(960, 640),
        background_color="#0B1020",       # match app ground → no white flash
    )
    tray.start_tray(on_open=window.show, on_quit=window.destroy)
    def _on_closing():                    # Discord-style: close hides to tray
        window.hide(); return False       # veto the actual close
    try: window.events.closing += _on_closing
    except (AttributeError, TypeError): pass   # older pywebview degrades to real close
    webview.start()
    return 0
```
Add a `--selfcheck` branch that boots the engine, hits the real API headless, and exits — a useful CI smoke for the *engine*. **But `--selfcheck` is NOT acceptance for the GUI: it proves the server boots, not that a window renders.** SentinelBox v1.1.0 shipped a frozen app + installer that both launched and hung silently with no window because PyInstaller dropped `webview/lib/*.dll` — every gate had only ever run `--selfcheck`, and the installer had never once been run to completion. Before shipping, you MUST also run the frozen exe and confirm a **visible window** appears (see the `verify_build.py` gate below).

**3. Single-instance named mutex** (`singleton.py`, Windows; lock-file fallback elsewhere):
```python
_MUTEX = "Global\\MyAppDesktopSingleton"
_handle = None
def acquire() -> bool:
    global _handle
    try:
        import win32api, win32event, winerror
        _handle = win32event.CreateMutex(None, False, _MUTEX)   # keep ref for process life
        return win32api.GetLastError() != winerror.ERROR_ALREADY_EXISTS
    except ImportError:
        import atexit, os, tempfile
        lock = os.path.join(tempfile.gettempdir(), "myapp.lock")
        try: fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_RDWR)
        except FileExistsError: return False
        _handle = fd; atexit.register(lambda: (os.close(fd), os.unlink(lock))); return True
```

**4. Per-user autostart** (`autostart.py`) — `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, value = `f'"{sys.executable}"'` when frozen (else `-m shell` in dev). `enable()`/`disable()`/`is_enabled()` wrap `winreg`. No elevation.

**5. Runtime-drawn tray icon** (`tray.py`) — draw the icon with Pillow at runtime (rounded square + accent dot) so the tray works with **no shipped asset**; packaging can swap a real `.ico` later. Runs on its own daemon thread so pywebview keeps the main thread. Degrades to no-tray if `pystray`/`Pillow` absent.

**6. Two PyInstaller specs.** `engine.spec` — onedir, `console=False`, `collect_all` for webview/pystray/PIL + `collect_submodules("uvicorn")`, bundle your web UI as `datas`. `setup.spec` — onefile, bundles `dist/<App>` as `payload/` + the installer UI as `ui/`. `build.ps1` runs both in order and prints artifact sizes. Resolve bundled resources in both dev and frozen modes with `Path(getattr(sys, "_MEIPASS", <script dir>)) / rel`.

**7. Post-build `verify_build.py` gate (window-render, not just build-succeeded).** `build.ps1` MUST end by running a `verify_build.py` that fails the build unless BOTH hold: (a) the GUI backend native libs are present in `dist/<App>/` — assert `webview/lib/*.dll` exist (glob and count), because `collect_all(webview)` can silently drop them and the app then hangs with no window; and (b) launching the frozen exe actually **renders a visible window** — spawn `dist/<App>/<App>.exe`, wait, then confirm a top-level window belongs to that PID (Win32 `EnumWindows` + `GetWindowThreadProcessId` + `IsWindowVisible`, or a screenshot diff), and kill it. Exit non-zero on either failure. **A `--selfcheck` pass does NOT substitute for this** — it proves the engine boots, not that WebView2 rendered. This gate is what would have caught the v1.1.0 "launches but no window" ship-block before it reached the owner.

## Delta: bundling local AI (torch / ultralytics / cv2) + external binaries

If the app ships **on-device AI** (a YOLO/torch model — see `local-media-ai/on-device-yolo-detection-pipeline.md`) or **sidecar binaries** (go2rtc/ffmpeg — see `local-media-ai/go2rtc-live-streaming-sidecar.md`), the freeze needs three additions. Verified against `D:\SentinelBox\desktop\packaging\engine.spec`:

- **`collect_all` the heavy dynamic packages too**, wrapped in try/except (torchvision is optional): `for pkg in ("webview","pystray","PIL","torch","torchvision","ultralytics","cv2"): collect_all(pkg)`. These ship data files + native libs static analysis can't find. `collect_submodules("app")` also — the AI/stream modules use **lazy imports inside functions**, so PyInstaller can't see `app.*` without it.
- **Bundle external binaries + weights as a `datas` dir**, resolved at runtime from `sys._MEIPASS/bundled`: `(os.path.join(ROOT, "bundled"), "bundled")` carries `go2rtc.exe` + `ffmpeg.exe` + `models/yolov8n.pt` + any demo asset. The engine's `_bundled_dir()` helper reads them from there when frozen.
- **Exclude PIL's dead codecs to reclaim ~10 MB** *when you only use `Image.new`/`ImageDraw`* (e.g. a runtime-drawn tray icon) and never decode/encode real images: `excludes += ["PIL._avif","PIL.AvifImagePlugin","PIL._webp","PIL.WebPImagePlugin","PIL._imagingcms","PIL.ImageCms","PIL._imagingft","PIL.ImageFont","PIL._imagingtk","PIL.ImageQt","PIL.PdfImagePlugin"]` (`_avif` alone is 7.6 MB). Keep `PIL._imaging` (ImageDraw needs it). If you later load a real `.ico`/`.png` via PIL, drop the `_imagingft`/format excludes you actually use.
- **Torch makes the bundle big and slow to build** — expect a multi-hundred-MB onedir. Run a frozen `--ai-selfcheck` (loads torch/ultralytics/cv2 and runs one detection) because a missing torch native lib only surfaces at runtime, deep in `warm()`. But remember `--selfcheck`/`--ai-selfcheck` verify the *engine*, never the GUI — you still need the `verify_build.py` window-render gate (piece 7); the two failures are independent (a matplotlib exclude killed the frozen AI; a dropped `webview/lib` DLL killed the frozen window — each shipped past the other's smoke).
