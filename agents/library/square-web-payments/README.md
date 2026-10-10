# square-web-payments — RAW HARVEST, not yet a recipe

Harvested 2026-09-02 for the Lanwright build (plan §1b) from the uncommitted elevare-studio
worktree `wf_ca6d7a5e-34e-6` (branch `wave/money-app`), the only Square Web Payments SDK code
in the estate. Copied here so a worktree GC cannot delete it. `pattern-librarian` turns it into
a proper entry once the Lanwright Square adapter ships and has been watched to succeed.

## What is in `_source/`
- `invoices-id/square-payment.tsx` — the client surface. `squareStyle()` reads live CSS custom
  properties off `[data-surface="app"]` at runtime (no hex in code); typed SDK sliver
  (`SquareCard { attach, tokenize, destroy }`, `window.Square`); "★ NEVER A PAY BUTTON THAT
  CANNOT PAY" (payEnabled measured server-side, disabled panel names what is missing);
  "★ THE BROWSER NEVER NAMES AN AMOUNT"; the CSP block for `web.squarecdn.com`,
  `sandbox.web.squarecdn.com`, `pci-connect.squareup.com`.
- `lib-billing/square.ts` — server-only env presence module ("SQUARE IS THE RAIL"), exports
  presence booleans never values; the four env names; TODO(square-invoice-dispatch) list.
- `lib-billing/{contract,money,parse,read,zero-sales}.ts` — the studio invoice pipeline these
  sat beside (Elevare-billing specific; keep for the money-unit and parse patterns only).

## Status
UNVERIFIED against the Square sandbox: `square.ts` itself records that no dispatch was ever
watched to succeed. Treat as a starting point, not a working rail.
