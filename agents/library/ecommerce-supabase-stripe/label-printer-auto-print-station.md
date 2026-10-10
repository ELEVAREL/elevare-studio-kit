# Label-printer auto-print fulfillment station

**What it is.** A dashboard page you leave open on the packing bench that **polls for new paid orders**, plays a chime when one lands, and **auto-prints a 4×6 packing slip** to the default printer via a hidden iframe + `@page` print CSS. No print server, no native app, no websocket — pure client polling.

**When to reach for it.** Any small shop / studio / kitchen that fulfills orders from a browser and wants "order comes in → label prints" without buying a print-server integration. Works with cheap thermal label printers.

## The pieces

**1. Poll loop (15s), refresh-safe dedupe.** Query today's `paid`/`making` orders newest-first. Persist a *seen-ids* Set in `localStorage` so a page refresh never re-chimes or re-prints an order. On the *first* successful poll, mark everything already present as seen **without reacting** — only react to orders that arrive while the station is open.

```ts
const POLL_MS = 15_000;
// first poll: seed `seen` silently. subsequent polls:
const fresh = rows.filter(r => !seen.current.has(r.id));
for (const r of fresh) seen.current.add(r.id);   // dedupe BEFORE any async print
persistSeen();                                    // cap stored set (~last 500)
if (fresh.length) { playChime(); if (autoPrint) fresh.forEach(printLabel /* stagger extras */); }
```

**2. WebAudio chime — no asset.** A two-tone sine ping (A5 → D6) built in-code; `try/catch` because audio may be blocked until first user interaction.

**3. Hidden-iframe auto-print.** Point an off-screen iframe at the label route with `?autoprint=1`; the label page calls `window.print()` itself once fonts settle. Cache-bust with `&t=Date.now()` so repeated prints re-trigger.

```tsx
<iframe ref={printFrame} aria-hidden tabIndex={-1}
  className="pointer-events-none fixed -left-[9999px] top-0 h-px w-px opacity-0" />
// printLabel: frame.src = `/dashboard/orders/${id}/packing-slip?format=label&autoprint=1&t=${Date.now()}`
```

**4. 4×6 `@page` print CSS (component-scoped).** Size the sheet, zero margins, hide all dashboard chrome so only the label prints:

```css
@media print {
  @page { size: 4in 6in; margin: 0; }
  html, body { background:#fff !important; margin:0 !important; padding:0 !important; }
  body::before { display:none !important; }        /* kill the paper-grain overlay */
  aside, header, .no-print { display:none !important; }
  [data-label-slip] { width:4in !important; min-height:6in !important; box-shadow:none !important; border:0 !important; }
}
```

The slip itself is black-on-white, high-contrast, sized in inches: brand row, `#order` + date, ship-to `<address>`, pack list (`qty× name (sku)`), customer note, footer.

## The honest caveat (say it in the UI)
**A browser cannot choose a named printer.** `window.print()` targets whatever the OS **default printer** is, through the print dialog. So:
- Tell the owner: *set your label printer as the computer's default printer.*
- To skip the dialog entirely: launch Chrome with `--kiosk-printing` — it prints silently to the default printer.
Ship this as a visible "Set up once" note, plus a manual **Test print** and per-row **Print** button so it never depends solely on auto-fire.

## Assumes / adapt
- **Polling, not realtime.** 15s is fine for a bench workflow and dodges Supabase Realtime setup. Swap in Realtime if you need instant.
- **Dedupe before the async print**, and persist the seen-set — otherwise a slow print + next poll double-prints. Cap the stored set so it can't grow unbounded.
- **First-poll-silent** is the key UX rule: don't blast the chime/printer for the backlog when the tab opens.
- Provide an **auto-print toggle** (persisted) and a chime indicator; some owners want to print manually.
- Scope all print CSS to a `[data-label-slip]` marker so it can't leak into other routes; explicitly hide any fixed background overlay (`body::before`).
- Stagger multiple simultaneous prints (~2.5s apart) so each job is distinct.
