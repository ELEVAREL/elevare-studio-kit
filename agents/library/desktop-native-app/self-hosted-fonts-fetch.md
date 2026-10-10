# Self-host Google Fonts (fetch woff2 + emit local fonts.css)

**When to reach for it:** you want brand fonts on a surface that **can't or shouldn't hit fonts.googleapis.com at runtime** — an offline/native app, a frameless installer window, a `file://` page, an air-gapped kiosk, or just any site where you want zero third-party font requests (privacy, no FOUT/layout-shift, no CDN dependency). This is a one-shot build-time script: it downloads the latin woff2 files locally and writes a `fonts.css` that `@font-face`s them from disk. Reach for it whenever a design uses a Google/Fontsource font and the delivered artifact must be self-contained.

**Assumes / adapt:**
- **Chrome UA is the trick.** Google Fonts' CSS2 endpoint returns woff2 (smallest) only when the request looks like a modern Chrome. With a Python/`urllib` default UA you get older formats or none — so send a real Chrome User-Agent header on **both** the CSS fetch and the woff2 fetch.
- **Two-step flow:** (1) fetch the CSS2 URL for each family/weight (`https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap`) with the Chrome UA; (2) it comes back sectioned by subset with `/* latin */` comments — regex the **latin** `@font-face` block, pull its `.woff2` URL, download it, and re-emit a local `@font-face` pointing at `fonts/<slug>-<weight>.woff2`. Add `/* cyrillic */`, `/* greek */` etc. only if you need them (each is a separate file).
- **Run once at build time, commit the output.** The script and the raw CSS inputs are throwaway; the `fonts/` folder + generated `fonts.css` are what ship. Mark the generated CSS "do not edit by hand."
- **`font-display: swap`** in the emitted CSS so text paints immediately in a fallback and swaps when the woff2 lands — important on a slow first paint.
- **Reference:** generated output at `D:\SentinelBox\desktop\installer\ui\fonts.css` (+ `fonts/`), used by [`animated-installer-statemachine.md`](animated-installer-statemachine.md) and the SentinelBox site/app. The fetch script below is the reusable form (the scratchpad original hardcoded paths + read pre-saved CSS files; this version fetches the CSS itself so it's fully standalone).

## The script (standalone: fetches CSS + woff2, emits local fonts.css)

```python
"""Download Google Fonts latin woff2 files and emit a self-hosted fonts.css.
Run once at build time; commit fonts/ + fonts.css. Adapt FAMILIES + OUT_DIR."""
import re, urllib.request, pathlib

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")  # woff2 needs a Chrome UA

# family -> (google css2 name, [weights], local slug)
FAMILIES = {
    "Bricolage Grotesque": ("Bricolage+Grotesque", [600, 700, 800], "bricolage"),
    "IBM Plex Sans":       ("IBM+Plex+Sans",       [400, 500, 600], "plexsans"),
    "IBM Plex Mono":       ("IBM+Plex+Mono",       [400, 500, 600], "plexmono"),
}
OUT_DIR = pathlib.Path("ui")           # <-- where fonts.css lives
FONTS   = OUT_DIR / "fonts"; FONTS.mkdir(parents=True, exist_ok=True)

def get(url: str) -> bytes:
    return urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30).read()

latin_block = re.compile(r"/\*\s*latin\s*\*/\s*(@font-face\s*\{[^}]*\})", re.I)
url_re      = re.compile(r"url\((https://[^)]+\.woff2)\)")

out = ["/* Self-hosted brand fonts (latin). Generated; do not edit by hand. */"]
for fam, (goog, weights, slug) in FAMILIES.items():
    axis = ";".join(str(w) for w in weights)
    css = get(f"https://fonts.googleapis.com/css2?family={goog}:wght@{axis}"
              "&display=swap").decode("utf-8")
    for block in latin_block.findall(css):
        w = re.search(r"font-weight:\s*(\d+)", block).group(1)
        woff2 = url_re.search(block).group(1)
        fname = f"{slug}-{w}.woff2"
        (FONTS / fname).write_bytes(get(woff2))
        out.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};"
                   f"font-display:swap;src:url('fonts/{fname}') format('woff2');}}")
        print(f"  {fname:22} saved")

(OUT_DIR / "fonts.css").write_text("\n".join(out) + "\n", encoding="utf-8")
print(f"wrote {OUT_DIR / 'fonts.css'}")
```
Then just `<link rel="stylesheet" href="fonts.css">` and the surface is fully self-contained.
