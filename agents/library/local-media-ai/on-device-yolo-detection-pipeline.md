# On-device YOLO detection pipeline (background frame-sampling → filtered detections → cooldowned events)

**When to reach for it:** you want **local, offline object detection** on a live video feed — "alert me when it sees a person / car / dog," no cloud vision API, footage never leaves the machine. Ultralytics YOLOv8n on CPU (GPU if present), sampling frames from a stream on a background thread, filtering to classes you care about, and firing an event/alert per detection with a **per-source+label cooldown** so one intruder doesn't fire 50 alerts. The "knows a person from a passing car, on your own machine" capability.

**Assumes / adapt:**
- **Frames come from the go2rtc sidecar** (`local-media-ai/go2rtc-live-streaming-sidecar.md`) as `GET /api/frame.jpeg?src=...` JPEGs — but any JPEG source works (a capture card, screenshot, RTSP-via-cv2). Adapt `_frame()`.
- **THE frozen-build gotcha — YOLO_CONFIG_DIR.** In a PyInstaller/read-only bundle, ultralytics' default config dir is read-only and first run **HANGS** forever trying to write `settings.yaml`. Point `YOLO_CONFIG_DIR` at a writable per-user dir **before importing YOLO**, and set `YOLO_OFFLINE=1` to kill the PyPI update ping. Set both **unconditionally** — a leftover value pointing at a read-only dir silently reinstates the hang. This single fix is why the pattern is worth harvesting.
- **Lazy, cached model load.** Import `cv2`/`numpy`/`ultralytics` *inside* functions (not module top-level) so PyInstaller static analysis + startup time behave; `@lru_cache(maxsize=1)` the model so it loads once. `warm()` forces the load and **prints the traceback on failure** — a silent `False` means the AI loop spins forever detecting nothing (e.g. a missing native lib in a frozen build). Keep that surfacing.
- **Weights resolution:** frozen `sys._MEIPASS/bundled/models/yolov8n.pt` vs dev `repo_root/bundled/models/...`; fall back to the bare name `"yolov8n.pt"` so ultralytics fetches it on first use if unbundled. Bundle the `.pt` for a truly offline install.
- **Filter to classes of interest.** COCO has 80 classes; a security product wants ~8 (`person/bicycle/car/motorcycle/bus/truck/dog/cat`). Edit `CLASSES_OF_INTEREST` to your domain — this is where you tune signal-vs-noise.
- **Cooldown is per `(source_id, label)`**, keyed by wall-clock, gating which detections become events. Tune `ai_cooldown` (seconds between repeat alerts) + `ai_interval` (loop sleep) + `conf` threshold to your tolerance.
- **The loop must never die.** `except Exception: pass` around the per-frame body — a single bad frame killing the thread means silent blindness. Join on stop so shutdown doesn't tear down the stream sidecar mid-write.
- **Packaging:** `collect_all("torch"/"torchvision"/"ultralytics"/"cv2")` in the PyInstaller spec — see the torch delta in `desktop-native-app/pywebview-pyinstaller-boilerplate.md`.

**Reference:** `D:\SentinelBox\engine\backend\app\ai\detector.py` (model load + `detect()` + `warm()`) and `ai\pipeline.py` (background thread, sampling, cooldown, annotate, event dispatch).

## The load-bearing pieces

**Model load — the frozen-hang fix (set env BEFORE importing YOLO):**
```python
@lru_cache(maxsize=1)
def _model():
    cfg = get_settings().data_dir / "ultralytics"
    cfg.mkdir(parents=True, exist_ok=True)
    os.environ["YOLO_CONFIG_DIR"] = str(cfg)   # else frozen first-run HANGS on settings.yaml
    os.environ["YOLO_OFFLINE"]    = "1"        # no pip/pypi update ping on load
    from ultralytics import YOLO               # import AFTER env is set
    return YOLO(_model_path())

def warm() -> bool:
    try:
        _model(); return True
    except Exception as exc:                    # SURFACE it — silent False = blind loop
        import traceback; print(f"AI model load failed: {exc}", file=sys.stderr)
        traceback.print_exc(); return False
```

**Detect only classes of interest:**
```python
CLASSES_OF_INTEREST = {"person","bicycle","car","motorcycle","bus","truck","dog","cat"}

def detect(jpeg_bytes: bytes, conf: float = 0.4) -> list[dict]:
    import cv2, numpy as np
    img = cv2.imdecode(np.frombuffer(jpeg_bytes, np.uint8), cv2.IMREAD_COLOR)
    if img is None: return []
    result, names = (m := _model())(img, conf=conf, verbose=False)[0], m.names
    out = []
    for box in result.boxes:
        label = names[int(box.cls)]
        if label not in CLASSES_OF_INTEREST: continue
        x1,y1,x2,y2 = (float(v) for v in box.xyxy[0].tolist())
        out.append({"label": label, "confidence": float(box.conf), "bbox": [x1,y1,x2,y2]})
    return out
```

**Background loop with per-(source,label) cooldown + annotated-snapshot event:**
```python
def _run(self):
    detector.warm()
    while not self._stop.is_set():
        s = get_settings()
        try:
            for cam in camrepo.list_all():
                if not (cam.enabled and cam.ai_enabled and manager.is_running()): continue
                jpg = self._frame(cam.id)
                if not jpg: continue
                dets, fresh, now = detector.detect(jpg), [], time.time()
                for d in dets:
                    key = (cam.id, d["label"])
                    if now - self._cooldown.get(key, 0) >= s.ai_cooldown:
                        self._cooldown[key] = now; fresh.append(d)
                if fresh:
                    snap = _annotate(jpg, dets)                 # draw boxes on the frame
                    for d in fresh:
                        eid = eventrepo.record(cam.id, cam.name, d["label"], d["confidence"], snap)
                        self._dispatch(eid, cam.name, d, snap)  # alert
        except Exception:
            pass                                                # a bad frame must never kill the loop
        self._stop.wait(s.ai_interval)
```
