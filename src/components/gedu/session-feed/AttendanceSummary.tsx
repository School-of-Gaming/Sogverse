"use client";

import { useState } from "react";
import { Check, ChevronDown, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { attendanceCounts } from "./entry-state";
import type { SessionFeedGamer } from "./types";
import { CollapsibleRegion } from "./CollapsibleRegion";

/**
 * "6 of 8 present", expanding to the per-gamer list.
 *
 * The headline is what a gedu scanning the feed actually needs; the names are a
 * follow-up question, so they live behind a disclosure that grows downward from
 * the summary row. The summary row itself never moves, which is what keeps a
 * second click from landing on whatever the expansion pushed into its place.
 */
export function AttendanceSummary({
  roster,
  presentGamerIds,
}: {
  roster: readonly SessionFeedGamer[];
  presentGamerIds: readonly string[];
}) {
  const t = useTranslations("gedu.sessionFeed");
  const [open, setOpen] = useState(false);
  const { present, total } = attendanceCounts(roster, presentGamerIds);
  const presentSet = new Set(presentGamerIds);

  if (total === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <UserRound className="h-3.5 w-3.5" aria-hidden />
        <span className="tabular-nums">
          {t("attendanceSummary", { present, total })}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      <CollapsibleRegion open={open}>
        <ul className="flex flex-wrap gap-1.5 pt-2">
          {roster.map((gamer) => {
            const isPresent = presentSet.has(gamer.id);
            return (
              <li
                key={gamer.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  isPresent
                    ? "border-success/40 text-success"
                    : "border-border text-muted-foreground",
                )}
              >
                {isPresent ? (
                  <Check className="h-3 w-3" aria-hidden />
                ) : (
                  <X className="h-3 w-3" aria-hidden />
                )}
                <span className="sr-only">
                  {isPresent ? t("presentLabel") : t("absentLabel")}
                </span>
                {gamer.firstName}
              </li>
            );
          })}
        </ul>
      </CollapsibleRegion>
    </div>
  );
}
