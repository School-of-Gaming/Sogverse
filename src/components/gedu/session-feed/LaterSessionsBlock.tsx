"use client";

import { ChevronDown, UserRoundSearch } from "lucide-react";
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
 * The one thing that must never hide behind the collapse is a substitute
 * request: it is a session the gedu has said they cannot run, and it needs
 * somebody to act. So the count of them is surfaced on the closed row in the
 * warning tone, and it stays rendered when the block opens — a chip that
 * appeared and disappeared with the toggle would reflow the row under the
 * cursor.
 */
export function LaterSessionsBlock({
  count,
  substituteCount,
  open,
  onToggle,
  children,
}: {
  /** How many future sessions are behind the collapse. */
  count: number;
  /** How many of those have been flagged as needing a substitute. */
  substituteCount: number;
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
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-dashed border-border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="font-medium">{t("laterSessions", { count })}</span>
          {substituteCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-warning">
              <UserRoundSearch className="h-3.5 w-3.5" aria-hidden />
              {t("laterSessionsSubstitutes", { count: substituteCount })}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      <CollapsibleRegion open={open}>{children}</CollapsibleRegion>
    </div>
  );
}
