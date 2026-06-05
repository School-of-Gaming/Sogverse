"use client";

import { useState } from "react";
import { AlertTriangle, CreditCard, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SessionAudience } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Circular corner alert that straddles the top-right corner of a session card
 * when the gamer's club subscription has a payment problem (declined or expired
 * card → Stripe `past_due`).
 *
 * Same badge, same corner, for both audiences — only the behaviour differs:
 *
 * - **Parent** (`audience="customer"`): a clickable button. Credit-card icon
 *   (plus an alert icon on prominent cards via `showAlert`), and clicking opens
 *   Stripe's Customer Portal so they can fix the card on file.
 * - **Gamer** (`audience="gamer"`): informational only. Billing is the parent's
 *   job, so the gamer never sees money — just the alert icon and a tooltip
 *   telling them to ask a parent. Rendered as a non-interactive element: no
 *   credit card, no click, no-op.
 *
 * Positioned `-top-2 -right-2` so it sits *on* the corner, half hanging off the
 * edge. The parent must provide a `relative` ancestor that does NOT clip
 * overflow — a `Card` with `overflow-hidden` would cut the badge in half, so
 * wrap such a card in a plain `relative` shell and render this as its sibling.
 * Because it lives over the corner (not in the body), it never reflows card
 * content — satisfies the "rendered content must not move" rule.
 *
 * The parent variant reuses the committing-state pattern from
 * `ManageBillingCard`: a local `opening` flag set synchronously before the
 * fetch and held through the full-page navigation to Stripe, so a fast
 * double-click can't open two portal sessions. The full-page
 * `window.location.href` (not `router.push`) is deliberate — we're leaving the
 * app for an external origin. See CLAUDE.md "Loading & Disabled State" and
 * "Auth Architecture".
 */

// Shared corner styling. Solid fill + a ring in the page colour so the badge
// reads as a cut-out sitting on top of the corner rather than painted inside it.
const BADGE_BASE =
  "absolute -right-2 -top-2 z-10 inline-flex h-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm ring-2 ring-background";

export function PaymentProblemBadge({
  /** Whose dashboard this renders on. Drives interactivity + icon. */
  audience = "customer",
  /** Parent only: show an alert icon next to the card icon (prominent cards). */
  showAlert = false,
  className,
}: {
  audience?: SessionAudience;
  showAlert?: boolean;
  className?: string;
}) {
  const t = useTranslations("parent.billing.alert");
  const [opening, setOpening] = useState(false);

  // Gamer: no money, nothing to click. Just the alert icon + a "tell a parent"
  // tooltip, on a non-interactive element (role="img", not a button).
  if (audience === "gamer") {
    return (
      <div
        role="img"
        aria-label={t("gamerTooltip")}
        title={t("gamerTooltip")}
        className={cn(BADGE_BASE, "w-7 cursor-default", className)}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
      </div>
    );
  }

  const handleClick = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const response = await fetch("/api/parent/billing-portal", {
        method: "POST",
      });
      if (!response.ok) {
        setOpening(false);
        return;
      }
      const { url } = await response.json();
      // Leave `opening` set — the document unloads on navigation.
      window.location.href = url;
    } catch {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={opening}
      title={t("tooltip")}
      aria-label={t("tooltip")}
      className={cn(
        BADGE_BASE,
        showAlert ? "gap-1 px-2" : "w-7",
        "transition-colors hover:bg-destructive/90 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2",
        "disabled:opacity-70",
        className,
      )}
    >
      {opening ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <CreditCard className="h-4 w-4 shrink-0" />
          {showAlert && <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />}
        </>
      )}
    </button>
  );
}
