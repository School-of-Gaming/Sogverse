"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { CollapsibleRegion } from "./CollapsibleRegion";

/**
 * The collapsed row standing in for every future session beyond the next one.
 *
 * The feed's job is "what's next and what just happened", and an open-ended club
 * has eight future occurrences at any moment — eight cards of empty calendar
 * above the session the gedu actually cares about. So they collapse to one row,
 * which sits *above* the next session because global date order is never
 * violated: expanding grows the block downward from the row that was clicked, so
 * the row itself does not move and the revealed sessions read continuously down
 * into the prominent entry beneath them.
 *
 * The row says "N upcoming sessions" rather than "N later sessions": in a feed
 * that runs future-to-past, "later" is ambiguous about which direction it
 * means, and the row sitting at the very top is exactly where that ambiguity
 * costs the most.
 *
 * **The revealed sessions render inside the block, not under it.** The toggle
 * and the region it controls share one dashed container, with the toggle as its
 * header and a dashed rule between them. When they were siblings the expansion
 * spilled out past the bottom of the row that opened it, so the sessions read as
 * loose cards that happened to follow a button rather than as the contents of
 * the thing that was just opened — and the dashed row, which is the feed's
 * visual shorthand for "not a session, a control", looked like it had ended
 * halfway through its own content.
 */
export function LaterSessionsBlock({
  count,
  open,
  onToggle,
  children,
}: {
  /** How many future sessions are behind the collapse. */
  count: number;
  open: boolean;
  onToggle: () => void;
  /** The later sessions themselves, revealed on expand. */
  children: React.ReactNode;
}) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <div className="relative">
      <span
        aria-hidden
        className="absolute -left-6 top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-muted-foreground/25 ring-4 ring-background"
      />
      <div className="rounded-md border border-dashed border-border">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          // No ring offset: the button is the container's header row, so its
          // focus ring lands on the container's own border rather than floating
          // two pixels outside it.
          className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 font-medium">
            {t("laterSessions", { count })}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>

        <CollapsibleRegion open={open}>
          {/* The rule and the padding belong to the *content*, not to the
              region: a collapsed region has to shrink to nothing, and any
              border or vertical padding on the region itself survives the
              collapse as a stray line under the closed row. */}
          <div className="border-t border-dashed border-border p-3">
            {children}
          </div>
        </CollapsibleRegion>
      </div>
    </div>
  );
}
