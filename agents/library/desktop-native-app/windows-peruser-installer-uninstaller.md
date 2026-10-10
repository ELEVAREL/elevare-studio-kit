# Windows per-user installer + uninstaller in pure stdlib (stage-and-swap, HKCU ARP, delayed self-delete) — no Inno, no admin

**When to reach for it:** you're shipping a frozen Windows app and want a **real install experience** — Add/Remove Programs entry, run-on-boot, Start-menu shortcut, a working uninstaller, safe reinstall-over-previous — **without** Inno Setup, WiX, MSI, or admin/UAC. This is the pure-`stdlib` (`winreg`/`ctypes`/`subprocess`/`shutil`) install engine that runs *behind* an animated window. Pairs with [`animated-installer-statemachine.md`](animated-installer-statemachine.md) (the UI in front of it), [`pywebview-pyinstaller-boilerplate.md`](pywebview-pyinstaller-boilerplate.md) (the app it installs), and [`verified-self-update.md`](verified-self-update.md) (which re-launches this installer to update).

> The boilerplate entry mentions an *optional Inno Setup wrapper* as "the battle-tested path." This entry is the **verified stdlib alternative** used when Inno/admin aren't available or a fully self-contained, single-`.exe`, per-user install is wanted. Reach for whichever fits — this one needs zero external tooling.

**Assumes / adapt:**
- **Per-user, no elevation.** Install to `%LOCALAPPDATA%\Programs\<App>`, autostart via `HKCU\...\Run`, ARP under `HKCU\...\Uninstall\<App>`. Same model as Discord/VS Code — no UAC. Only go admin/`HKLM` if you genuinely need a service or all-users install.
- **Stage-and-swap is the whole safety story.** Copy the payload to `<App>.new` first; only when the copy *fully* succeeds, swap with two renames: `live → <App>.old`, `.new → live`, delete `.old`. A crash/cancel/mid-copy failure can **never** leave a half-overwritten mixed-version install, and reinstall/update over a previous version is safe. On a swap failure, rename `.old` back (rollback). Sweep stray `.new`/`.old` on next install/uninstall.
- **Registration happens strictly AFTER the swap.** Autostart + ARP entries are written only once the app files are live, so a cancelled/failed install can never leave registry state pointing at a broken or nonexistent dir. Track what this run wrote (`_wrote_autostart`, `_wrote_arp`) so cancel can undo exactly those.
- **Running-app detection via a named mutex, not a file lock.** The app holds a named mutex (`Global\<App>Singleton`) for its whole lifetime *including hidden-to-tray*. The installer probes it with `OpenMutexW` before staging; if held, it drives the UI to a "the app is running" state with a *Close it and continue* action (taskkill the tree + wait for the mutex to clear) instead of dying on a locked file mid-copy. The mutex name is duplicated as a literal in the installer because the uninstall build is stdlib-only and must not import the app package.
- **A running exe can't delete its own file** — and `uninstall.exe` lives inside the target dir. Hand the final tree removal to a **detached** `cmd` that waits for this process to exit then `rd /s /q`:
  ```python
  cmd /S /C "ping -n 4 127.0.0.1 >nul & rd /s /q "<INSTALL_DIR>""
  # launched DETACHED_PROCESS | CREATE_NO_WINDOW, cwd=%TEMP% (never inside the dir)
  ```
- **Uninstall keeps user data.** `%APPDATA%\<App>` (recordings, settings, license) is always preserved. Uninstall is deliberately PLAIN — one native `MessageBoxW` yes/no, then silent work; no second animated UI.
- **Disk pre-flight before any copy.** Demand `payload*2 + 500MB headroom` free on **both** the install-target and `%TEMP%` drives (a onefile bootstrapper expands its own payload into `%TEMP%\_MEI*` — a third transient copy). Fail with a friendly message, not mid-install. Do not "simplify" the `*2` away — the staged + swapped copies coexist during the swap.
- **`--uninstall` branch in the same file.** `main()` branches into `run_uninstall()` when invoked with `--uninstall` or when the exe is named `uninstall*`. Ship a slim stdlib-only `uninstall.exe` (built from this same file by a separate spec, no webview/payload) and register *that*; fall back to self-copying the full setup exe only if it's absent. ARP gets both `UninstallString` and `QuietUninstallString` (`--uninstall --quiet`).

## The ARP entry (HKCU — makes Windows "Apps" list you)
```python
with winreg.CreateKey(winreg.HKEY_CURRENT_USER, rf"Software\Microsoft\Windows\CurrentVersion\Uninstall\{APP}") as k:
    s("DisplayName", APP); s("DisplayVersion", ver); s("Publisher", PUBLISHER)
    s("DisplayIcon", exe); s("InstallLocation", dir); s("UninstallString", f'"{uninstaller}" --uninstall')
    s("QuietUninstallString", f'"{uninstaller}" --uninstall --quiet')
    d("EstimatedSize", dir_size_kb); d("NoModify", 1); d("NoRepair", 1)
```

**Source (verified end-to-end — install, reinstall-over, uninstall):** `D:\SentinelBox\desktop\installer\bootstrapper.py` — the entire install/uninstall engine (`_stage_payload`, `_swap_install`, `_rename_retry`, `_preflight_disk`, `_app_running`, `_write_arp_entry`, `run_uninstall`, `_remove_install_dir`). It also carries the `InstallerApi` bridge that streams honest byte-tied progress to the animated UI — see [`animated-installer-statemachine.md`](animated-installer-statemachine.md).
