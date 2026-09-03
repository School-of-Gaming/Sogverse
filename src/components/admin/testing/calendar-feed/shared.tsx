"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The small pieces every part of the calendar-feed card shares: the select
 * styling, the section headings, and the copy button.
 */

/**
 * A bare `<select>` dressed as an input.
 *
 * Copied rather than imported from the testing page: that page is one consumer
 * of this pattern and this card is another, and reaching across for a class
 * string would make one of them the other's dependency.
 */
export const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** How long the Copy button says "Copied" before returning to "Copy". */
const COPIED_MS = 1500;

/**
 * A section marker inside the card. Furniture rather than voice — small, muted
 * and tracked, scanned as structure — so it keeps its caps.
 */
export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

/**
 * Two labels in one grid cell, so a button that swaps one for the other keeps
 * the width of the longer of them.
 *
 * A button's own label is the thing most likely to change under a user's
 * cursor — "Copy" becoming "Copied", "Send" becoming "Working" — and a button
 * that resizes mid-click drags every sibling in its row along with it. Stacking
 * both labels in the same cell makes the width a property of the pair rather
 * than of whichever one is showing.
 */
export function SwappableLabel({
  label,
  alternate,
  showingAlternate,
}: {
  label: string;
  alternate: string;
  showingAlternate: boolean;
}) {
  return (
    <span className="grid">
      <span
        className={cn("col-start-1 row-start-1", showingAlternate && "invisible")}
      >
        {label}
      </span>
      <span
        className={cn(
          "col-start-1 row-start-1",
          !showingAlternate && "invisible",
        )}
      >
        {alternate}
      </span>
    </span>
  );
}

/** A copy button whose width does not change when its label does. */
export function CopyButton({ value }: { value: string }) {
  const t = useTranslations("admin.testing.calendarFeed");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        // A clipboard write can be refused (an insecure origin, a denied
        // permission); the refusal simply leaves the label alone.
        void navigator.clipboard.writeText(value).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
    >
      {/* The button is always as wide as the longer label, so confirming a copy
          never nudges the input beside it. */}
      <SwappableLabel
        label={t("copy")}
        alternate={t("copied")}
        showingAlternate={copied}
      />
    </Button>
  );
}
