# Remotion MP4 ad — React-authored video spot (Ken Burns, kinetic captions, count-up, SVG-draw, CTA card)

**When to reach for it:** a campaign needs a short **video advertisement** — a 15–30s social/infomercial spot, a product-reveal loop, an animated promo — and you want to author it as **React components** (real layout, tokens shared with the brand, deterministic renders) instead of a video editor. Remotion turns a `<Composition>` into an MP4. This entry captures the scene grammar, the shared-theme reuse, the font-loading discipline, and the **one deploy-blocking gotcha on this machine** (Remotion's bundled Chrome can't download → point it at local Chrome).

**Assumes / adapt:**
- **Scaffold:** `video/` with `remotion` + `@remotion/cli` + `react`/`react-dom` 18. `src/index.ts` = `registerRoot(RemotionRoot)`; `src/Root.tsx` = one `<Composition id="…" component={Main} durationInFrames fps width height />`. 30s @ 30fps = `durationInFrames={900}`, 1920×1080.
- **Share the brand tokens with print.** `src/theme.ts` exports the *same* hexes + font-family strings the print `build.mjs` uses (`C.paper/ink/navy/burgundy/wood/gold`, `SERIF`, `SANS`, `FPS`) so the spot and the printed ad are unmistakably one campaign. Recreate the logo as the same inline-SVG `Lockup` component.
- **Scene grammar (reusable primitives):**
  - `ease(f, [in,out], [a,b])` = clamped `interpolate` — the workhorse.
  - `sceneOpacity(f, dur)` = fade-in / hold / fade-out envelope per scene.
  - `<LineRise delay>` = each text line rises 24px + fades in, staggered by `delay` frames — the "kinetic caption" look.
  - `<KenBurns src from to ox oy dur>` = slow `scale()` on a cover-fit `<Img staticFile()>` with `transformOrigin` — motion on stills.
  - `<Plate delay>` = lower-third navy plate with a gold top-rule that slides in from the left — where captions live over photos.
  - `spring({frame, fps, config})` for the **count-up** (a number springing to "2 beds open now") and the phone-number pop on the CTA card.
  - An **SVG stroke-draw** beat: animate `strokeDashoffset` from `LEN`→`0` to draw a line (the Traway spot draws the accessibility ramp). `clipPath: inset(0 0 X% 0)` for a wipe reveal.
  - **CTA end card:** `Lockup` + phone number (spring-in + animated underline) + a pulsing radial gold glow + contact block. The number is the payoff — biggest, gold, last.
- **Sequence the scenes** with `<Sequence from durationInFrames>` back-to-back so `from` sums to `durationInFrames`. Keep a running total; a gap = black frames.
- **Fonts — self-host + gate the render.** Drop the localized `gf-local.css` (+ woff2) in `video/public/fonts/`, inject `<style>@import url("${staticFile("fonts/gf-local.css")}")</style>` in `Main`, and wrap a `delayRender('fonts')` / `continueRender` around `document.fonts.load(...)` for every weight so Remotion never rasterizes a frame before the fonts are ready (otherwise the first frames render in a fallback face). Same self-host trick as print: [`../desktop-native-app/self-hosted-fonts-fetch.md`](../desktop-native-app/self-hosted-fonts-fetch.md).
- **THE render gotcha on this machine — Remotion can't download its Chrome Headless Shell** (`npx remotion browser ensure` fails behind the environment's network). Fix: render against **local Chrome** with `--browser-executable`:
  ```
  npx remotion render src/index.ts <CompId> out/spot.mp4 \
    --browser-executable="C:\Program Files\Google\Chrome\Application\chrome.exe"
  ```
  The same flag works for `remotion still` (cheap per-scene preview) and `remotion studio` is unaffected.
- **Verify cheaply before the full render:** `npx remotion still src/index.ts <CompId> out/f450.png --frame=450 --browser-executable="…"` at one frame per scene catches layout/font/timing bugs in seconds instead of after a multi-minute render. 1920×1080 × 900 frames ≈ ~13 MB h264.
- **Design for mute autoplay.** Social video plays silent by default — carry the whole message in on-screen captions and end on the phone number/CTA. No reliance on a voiceover.
- **Reference implementation:** `D:\TrawayHome\ad\video\src\Root.tsx` (7-scene 30s infomercial: hook → meet-the-home → ramp SVG-draw → interior amenities → count-up offer → verbatim-promise cards → CTA end card), `theme.ts`, `package.json` (render script), `public/fonts/`.

## Font-gate snippet (drop into `Main`)

```tsx
const useFonts = () => {
  const [handle] = React.useState(() => delayRender("fonts"));
  useEffect(() => { (async () => {
    try {
      await Promise.all([
        (document as any).fonts.load("600 100px 'Cormorant Garamond'"),
        (document as any).fonts.load("400 100px 'Source Sans 3'"),
        (document as any).fonts.load("700 100px 'Source Sans 3'"),
      ]);
      await (document as any).fonts.ready;
    } catch {}
    continueRender(handle);
  })(); }, [handle]);
};
// in Main's JSX, before the <Sequence>s:
// <style>{`@import url("${staticFile("fonts/gf-local.css")}");`}</style>
```

## Cross-references
- Shared tokens + recreated SVG lockup come from [`shared-ad-design-system.md`](shared-ad-design-system.md).
- Self-host the fonts: [`../desktop-native-app/self-hosted-fonts-fetch.md`](../desktop-native-app/self-hosted-fonts-fetch.md).
- Deliver the MP4 alongside the print files: [`resend-attachment-delivery.md`](resend-attachment-delivery.md).
