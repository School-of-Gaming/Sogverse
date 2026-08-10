"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Minus, UserRound, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ATTENDANCE_TONE,
  attendanceMarkState,
} from "@/components/session-feed";
import { cn } from "@/lib/utils";
import { attendanceTally } from "./entry-state";
import type { AttendanceMarks, SessionFeedGamer } from "./types";
import { CollapsibleRegion } from "./CollapsibleRegion";

/**
 * The attendance line under a past session, expanding to the per-gamer list.
 *
 * **The headline answers whichever question is still open.** While the roster is
 * only part-marked it reports progress — "5 of 8 marked" — because that is the
 * number the gedu came back for; once every child has an answer it switches to
 * the one that matters afterwards, "6 of 8 present". A part-marked sheet showing
 * a present count would be read as the final tally by everyone who saw it, which
 * is the one misreading this surface cannot afford: attendance is what a gedu is
 * paid on.
 *
 * The names are a follow-up question, so they live behind a disclosure that
 * grows downward from the summary row. The summary row itself never moves, which
 * is what keeps a second click from landing on whatever the expansion pushed
 * into its place.
 */
export function AttendanceSummary({
  roster,
  attendance,
}: {
  roster: readonly SessionFeedGamer[];
  attendance: AttendanceMarks;
}) {
  const t = useTranslations("gedu.sessionFeed");
  const [open, setOpen] = useState(false);
  const namesId = useId();
  const { present, marked, total, complete } = attendanceTally(
    roster,
    attendance,
  );

  if (total === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={namesId}
        className="flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <UserRound className="h-3.5 w-3.5" aria-hidden />
        <span className="tabular-nums">
          {complete
            ? t("attendanceSummary", { present, total })
            : t("attendanceMarkedCount", { marked, total })}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      <CollapsibleRegion open={open} id={namesId}>
        <ul className="flex flex-wrap gap-1.5 pt-2">
          {roster.map((gamer) => {
            const mark = attendance[gamer.id];
            // The colours are the shared mark tones — the same map the family's
            // own chip reads, so "present is a small positive and absent is
            // neutral, never destructive" is decided once for both surfaces. The
            // glyph below stays this set's own: three states here against the
            // family's two, so the dash is spent on the unanswered one.
            const tone = ATTENDANCE_TONE[attendanceMarkState(mark)];
            return (
              <li
                key={gamer.id}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  tone.border,
                  tone.text,
                )}
              >
                <MarkGlyph mark={mark} />
                <span className="sr-only">
                  {mark === "present"
                    ? t("presentLabel")
                    : mark === "absent"
                      ? t("absentLabel")
                      : t("unmarkedLabel")}
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

function MarkGlyph({ mark }: { mark: "present" | "absent" | undefined }) {
  if (mark === "present") return <Check className="h-3 w-3" aria-hidden />;
  if (mark === "absent") return <X className="h-3 w-3" aria-hidden />;
  return <Minus className="h-3 w-3" aria-hidden />;
}
