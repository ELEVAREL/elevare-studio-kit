"use client";

/**
 * THE PAYMENT PANEL — Square Web Payments, wearing the app's own tokens.
 *
 * House staple (STANDARDS, "Payments are in-app and theme-matched by
 * default"): payment happens ON OUR PAGE and the payment UI LOOKS LIKE
 * THE APP. Square's card fields live in cross-origin iframes we cannot
 * style with CSS, so the SDK takes a style object instead. `squareStyle()`
 * below builds that object by READING the app's live custom properties
 * off the `[data-surface="app"]` scope at runtime, exactly the way the
 * house `buildStripeAppearance()` does. No hex is written here. Change
 * app-theme.css and the card fields follow.
 *
 * ★ NEVER A PAY BUTTON THAT CANNOT PAY.
 *   Two things must be true before this renders a chargeable form:
 *     1. `config` is non-null (NEXT_PUBLIC_SQUARE_APPLICATION_ID and
 *        NEXT_PUBLIC_SQUARE_LOCATION_ID are set; both are public by
 *        design and neither is a secret);
 *     2. `payEnabled` is true, which the SERVER decides by looking at
 *        whether it holds SQUARE_ACCESS_TOKEN. A browser cannot see that,
 *        so it is measured server-side and passed down.
 *   With either missing, this renders a disabled panel that NAMES what is
 *   missing and tells the client how to pay in the meantime. It does not
 *   go quiet, and it does not render a button that would fail.
 *
 * ★ THE BROWSER NEVER NAMES AN AMOUNT.
 *   `tokenize()` yields an opaque single-use token. The POST carries the
 *   invoice id and that token, and nothing else. The server rebuilds the
 *   amount from the invoice row and charges with its own access token,
 *   keyed on an idempotency key so a double-click cannot double-charge.
 *   The figure shown on this panel is for the human, never for the API.
 *
 * ── WHAT THIS NEEDS FROM THE OWNER BEFORE IT CAN GO LIVE ──────────
 * Reported, not silently arranged. The enforcing CSP in next.config.ts
 * currently has no Square origins, so the SDK would be blocked even with
 * keys present. When the keys land, these directives have to land in the
 * same change:
 *   script-src  https://web.squarecdn.com https://sandbox.web.squarecdn.com
 *               https://js.squareup.com https://js.squareupsandbox.com
 *   frame-src   https://web.squarecdn.com https://sandbox.web.squarecdn.com
 *   connect-src https://pci-connect.squareup.com
 *               https://pci-connect.squareupsandbox.com
 * and, ONLY if digital wallets (Apple Pay / Google Pay) are wanted, the
 * `Permissions-Policy` must change from `payment=()` to `payment=(self)`.
 * Card fields alone do not need that, which is why it is not changed here.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  SQUARE_PAY_ENDPOINT,
  type SquareConfig,
} from "@/lib/billing/contract";
import { usd } from "@/lib/billing/money";

/* ── The sliver of the Web Payments SDK this file touches ───────────── */

type SquareCard = {
  attach: (selector: string | HTMLElement) => Promise<void>;
  tokenize: () => Promise<{ status: string; token?: string; errors?: unknown }>;
  destroy: () => Promise<void>;
};

type SquarePayments = {
  card: (options?: Record<string, unknown>) => Promise<SquareCard>;
};

type SquareGlobal = {
  payments: (applicationId: string, locationId: string) => SquarePayments;
};

declare global {
  interface Window {
    Square?: SquareGlobal;
  }
}

const SDK_SRC: Record<SquareConfig["environment"], string> = {
  production: "https://web.squarecdn.com/v1/square.js",
  sandbox: "https://sandbox.web.squarecdn.com/v1/square.js",
};

/** Load the SDK once per document. Resolves when window.Square exists. */
function loadSquareSdk(src: string): Promise<SquareGlobal> {
  if (window.Square) return Promise.resolve(window.Square);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-square-sdk="${src}"]`
    );
    const onLoad = () => {
      if (window.Square) resolve(window.Square);
      else reject(new Error("SDK loaded without Square global"));
    };
    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("SDK failed to load")),
        { once: true }
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.squareSdk = src;
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("SDK failed to load")),
      { once: true }
    );
    document.head.appendChild(script);
  });
}

/**
 * The card-field style object, built from the app's own tokens.
 *
 * Reads the computed values off the `[data-surface="app"]` wrapper (the
 * scope app-theme.css defines them on) so this cannot drift from the
 * page around it. Every lookup carries a fallback for the case where the
 * scope is somehow absent, and the fallbacks are the theme's own values
 * rather than invented ones.
 */
function squareStyle(): Record<string, Record<string, string>> {
  const scope =
    document.querySelector<HTMLElement>('[data-surface="app"]') ??
    document.documentElement;
  const computed = getComputedStyle(scope);
  const token = (name: string, fallback: string) =>
    computed.getPropertyValue(name).trim() || fallback;

  const foreground = token("--foreground", "#1b1a21");
  const background = token("--background", "#f7f7fa");
  const muted = token("--muted", "#5d5b68");
  const iconMuted = token("--icon-muted", "#84828e");
  const controlBorder = token("--control-border", "#5d5b68");
  const accent = token("--accent", "#6d28d9");
  const error = token("--error", "#b32020");
  const radius = token("--r-sm", "6px");
  const bodySize = token("--at-body", "15px");

  return {
    input: {
      color: foreground,
      backgroundColor: background,
      fontSize: bodySize,
    },
    "input::placeholder": { color: iconMuted },
    ".input-container": {
      borderColor: controlBorder,
      borderRadius: radius,
    },
    ".input-container.is-focus": { borderColor: accent },
    ".input-container.is-error": { borderColor: error },
    ".message-text": { color: muted },
    ".message-icon": { color: muted },
    ".message-text.is-error": { color: error },
    ".message-icon.is-error": { color: error },
  };
}

type Phase = "loading" | "ready" | "paying" | "paid" | "unavailable";

export function SquarePayment({
  invoiceId,
  amountDueCents,
  config,
  payEnabled,
  missing,
}: {
  invoiceId: string;
  amountDueCents: number;
  config: SquareConfig | null;
  /** Server-measured: does this deployment hold a Square access token? */
  payEnabled: boolean;
  /** What is missing, in the client's language. Rendered verbatim. */
  missing: string[];
}) {
  const canCharge = Boolean(config) && payEnabled && amountDueCents > 0;

  const [phase, setPhase] = useState<Phase>(canCharge ? "loading" : "unavailable");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<SquareCard | null>(null);
  const containerId = useId();

  useEffect(() => {
    if (!canCharge || !config) return;
    let disposed = false;

    (async () => {
      try {
        const sdk = await loadSquareSdk(SDK_SRC[config.environment]);
        if (disposed) return;
        const payments = sdk.payments(config.applicationId, config.locationId);
        const card = await payments.card({ style: squareStyle() });
        if (disposed) {
          await card.destroy();
          return;
        }
        const host = containerRef.current;
        if (!host) return;
        await card.attach(host);
        if (disposed) {
          await card.destroy();
          return;
        }
        cardRef.current = card;
        setPhase("ready");
      } catch {
        // The SDK is blocked, offline, or misconfigured. Say so; do not
        // leave a spinner that never resolves.
        if (!disposed) {
          setPhase("unavailable");
          setError(
            "The card form could not load. Refresh the page, or pay from the invoice email we sent you."
          );
        }
      }
    })();

    return () => {
      disposed = true;
      const card = cardRef.current;
      cardRef.current = null;
      if (card) void card.destroy().catch(() => {});
    };
  }, [canCharge, config]);

  const pay = useCallback(async () => {
    const card = cardRef.current;
    if (!card || phase !== "ready") return;
    setError(null);
    setPhase("paying");

    let token: string;
    try {
      const result = await card.tokenize();
      if (result.status !== "OK" || !result.token) {
        setPhase("ready");
        setError(
          "Those card details were not accepted. Check them and try again."
        );
        return;
      }
      token = result.token;
    } catch {
      setPhase("ready");
      setError("The card could not be read. Try again in a moment.");
      return;
    }

    try {
      // No amount crosses this boundary. The server reads it from the
      // invoice row and keys idempotency on the invoice, so a repeated
      // submit settles once.
      const res = await fetch(SQUARE_PAY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, sourceId: token }),
      });
      if (!res.ok) {
        setPhase("ready");
        setError(
          res.status === 404
            ? "Card payment is not switched on yet. Pay from the invoice email we sent you, or reply to it and we will send a link."
            : "That payment did not go through, and you have not been charged. Try again, or reply to your invoice email and we will sort it out."
        );
        return;
      }
      setPhase("paid");
    } catch {
      setPhase("ready");
      setError(
        "We could not reach the payment service, and you have not been charged. Try again in a moment."
      );
    }
  }, [invoiceId, phase]);

  if (phase === "paid") {
    return (
      <div className="rounded-(--r-md) border border-card-border bg-card p-5 md:p-6">
        <h2 className="app-h3 text-(--ok)">Payment received</h2>
        <p className="mt-2 max-w-[65ch] text-muted">
          Thank you. Your receipt is on its way by email, and this invoice
          updates to paid as soon as the payment settles.
        </p>
      </div>
    );
  }

  if (!canCharge) {
    const reasons = [...missing];
    if (!payEnabled && reasons.length === 0) {
      reasons.push("the connection to Elevare's payment account");
    }
    return (
      <div className="rounded-(--r-md) border border-card-border bg-card p-5 md:p-6">
        <h2 className="app-h3 text-foreground">Paying this invoice</h2>
        {amountDueCents <= 0 ? (
          <p className="mt-2 max-w-[65ch] text-muted">
            There is nothing left to pay on this invoice.
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-[65ch] text-muted">
              Card payment inside the app is not switched on yet. What is
              still missing: {reasons.join(", ")}.
            </p>
            <p className="mt-3 max-w-[65ch] text-muted">
              In the meantime, pay from the invoice email we sent you, or
              reply to it and we will send you a payment link. Bank
              transfer is welcome and costs less than a card.
            </p>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-(--r-sm) bg-(--error-tint) px-3 py-2 text-(--error)"
              >
                {error}
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-(--r-md) border border-card-border bg-card p-5 md:p-6">
      <h2 className="app-h3 text-foreground">Pay this invoice</h2>
      <p className="mt-2 max-w-[65ch] text-muted">
        Paying {usd(amountDueCents)} to ELEVARESTUDIO LLC. Your card details
        go straight to our payment processor and never touch Elevare.
      </p>

      <div
        id={containerId}
        ref={containerRef}
        className="mt-4 min-h-24"
        aria-busy={phase === "loading" || undefined}
      />

      {phase === "loading" && (
        <p className="app-fine mt-2">Loading the card form...</p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-(--r-sm) bg-(--error-tint) px-3 py-2 text-(--error)"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={phase !== "ready"}
        /* OUTLINE, not an accent fill. APP-THEME §6 is explicit: Approve
           is the only accent-strong filled button in the entire client
           surface, and rarity is what makes it land. Pay is the weightiest
           control on this page and still takes the outline treatment,
           given emphasis by the heavier border and the amount in its own
           label rather than by borrowing the signature moment. Flagged to
           the conductor rather than improvised. */
        className="app-label mt-4 inline-flex min-h-11 items-center rounded-(--r-sm) border border-(--control-border-hover) px-5 py-2.5 font-semibold text-foreground transition-colors duration-(--dur-fast) hover:bg-(--surface) disabled:cursor-default disabled:border-(--disabled) disabled:font-medium disabled:text-muted"
      >
        {phase === "paying" ? "Paying..." : `Pay ${usd(amountDueCents)}`}
      </button>
    </div>
  );
}
