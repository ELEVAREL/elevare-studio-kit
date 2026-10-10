# Single-supervisor reliability loop for sidecar subprocesses (reap + backoff + graceful stop + disk-safe retention)

**When to reach for it:** any local app that spawns and must keep alive **long-running child processes it doesn't own** — a streaming sidecar (`go2rtc`), per-source `ffmpeg` recorders, a transcoder, a background worker pool — and that writes files to disk it has to *retain within a budget without ever losing the freshest data*. This is the "keep the engine running for weeks unattended on a customer's PC" layer under a local media/NVR/kiosk app. Pairs with [`go2rtc-live-streaming-sidecar.md`](go2rtc-live-streaming-sidecar.md) (the sidecar it supervises) and [`on-device-yolo-detection-pipeline.md`](on-device-yolo-detection-pipeline.md); ships inside the frozen app from [`../desktop-native-app/pywebview-pyinstaller-boilerplate.md`](../desktop-native-app/pywebview-pyinstaller-boilerplate.md).

**Assumes / adapt:**
- **ONE supervisor thread does everything.** A single daemon thread (`sbx-supervisor`, tick ~10s) reaps dead children, respawns them, supervises the streaming sidecar, checks the disk floor, and runs retention on a slower cadence. Do **not** spin a thread per concern — one loop with a public `supervise_once()` you can call from a test without threads. Adapt the tick and prune cadences to your segment length.
- **Backoff is per-child, and "lived long enough" resets it.** `min(60s, 2**fails)`. A child that stayed alive ≥ `_STABLE_SECONDS` (60s) before dying is a *fresh* failure (`fails = 1`), not the next step of a crash-loop — otherwise a process that runs fine for an hour then dies once waits 60s to come back for no reason. Track `spawned` time per child to compute this.
- **`is_running()` means "at least one process is actually alive"** (`p.poll() is None`), never "we called start()". Status the UI shows must reflect real process state.
- **Graceful stop, not TerminateProcess.** For ffmpeg, send `b"q"` on stdin (needs `stdin=PIPE` and **no `-nostdin`**) then `wait(timeout=5)`, escalating to `kill()` only if it won't quit. A hard kill corrupts the tail segment of *every* recorder. See the fragmented-MP4 note below for why even a killed segment can survive.
- **Kill-stragglers is scoped to YOUR command line, guarded to "no live procs of our own."** A crashed parent orphans children that keep holding a fixed port / writing files. On start (only when you have zero live children), sweep them — but filter the process list to command lines containing **your** config path / recordings dir, never by image name (`ffmpeg.exe`), or you kill another app's ffmpeg. Windows: `Get-CimInstance Win32_Process -Filter "Name='x.exe'" | Where CommandLine -like '*<marker>*' | Stop-Process`. POSIX: `pkill -f <marker>`.

## The four load-bearing pieces

**1. Fragmented MP4 so a hard-killed segment stays playable.** A plain MP4 writes its `moov` atom at the end — a segment cut short by crash/power-loss loses it and the *whole file* is unplayable. Fragmented flags write it incrementally:
```python
"-segment_format_options", "movflags=+frag_keyframe+empty_moov",
```
Combined with graceful stop, this is belt-and-suspenders: clean quit finalizes normally; a crash still leaves a playable clip.

**2. Graceful ffmpeg shutdown (`stop_proc`):**
```python
if proc.poll() is None:
    if proc.stdin:
        proc.stdin.write(b"q"); proc.stdin.flush()   # ffmpeg's clean-quit key
    try: proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill(); proc.wait(timeout=2)             # escalate only if it won't go
```

**3. Reap-and-respawn tick with resetting backoff:**
```python
lived = now - st.get("spawned", 0.0)
st["fails"] = 1 if lived >= _STABLE_SECONDS else st["fails"] + 1   # <-- the reset
st["next"]  = now + min(_BACKOFF_CAP, 2.0 ** st["fails"])
```

**4. Disk-safe retention — three guards, in order, and NEVER whole-disk `used%`.**
The prune that deletes to enforce a cap is the highest-blast-radius code in the app (it can silently delete the customer's only footage). Rules, all present in the reference:
- **Never delete a file younger than `segment_seconds * 2`** — it may be the one being written right now.
- **Always keep the newest segment per camera** (a `protected` set), even if it's over budget/age. "Keep N" logic must prove *which* items survive (cf. STANDARDS "Destructive prune/cap correctness" — sort by real mtime, never lexicographic filename).
- **Budget on the recordings TREE's own size** (`tree_size <= total * max_disk_pct/100`), **not whole-disk used%.** Whole-disk `used%` is unsatisfiable — other apps' files can push it past the cap no matter how much you delete, so the pruner deletes *everything* trying to hit a number it can't reach.
- Then a **free-space floor with hysteresis** (pause recording below 2 GB free, resume at 2.5 GB) so the machine never fills up. Reclaim from retention *before* pausing.
Every delete decision is logged with its reason.

**Source (verified, weeks of unattended runtime):**
- `D:\SentinelBox\engine\backend\app\recording\manager.py` — the supervisor loop, backoff, graceful stop, fragmented-MP4 recorders, and the whole retention block (`_prune`).
- `D:\SentinelBox\engine\backend\app\streams\go2rtc_manager.py` — `supervise()` / `_handle_death()` / `_kill_stragglers()`: the same backoff + degraded-after-3-crashes + port-conflict-tail-diagnostic pattern for the streaming sidecar, driven by the *same* single supervisor thread (recording.manager calls `go2rtc.supervise()` each tick).
