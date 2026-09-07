"use client";

import { Check, Minus, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  ATTENDANCE_TONE,
  attendanceMarkState,
} from "@/components/session-feed";
import { cn } from "@/lib/utils";
import { isExpectedOnEntry } from "./entry-state";
import type { AttendanceMarks, SessionFeedEntry, SessionFeedGamer } from "./types";

/**
 * The attendance chips under a past session — one per gamer, always visible.
 *
 * This used to be a "5 of 8 marked" summary line with the chips behind a
 * disclosure. The owner removed both on purpose: a roster is single figures to
 * low tens, so the chips cost no meaningful space, and the count was a worse
 * answer than the chips themselves — the reader's next question was always
 * "which ones", which is what the chips say at a glance. Do not reintroduce a
 * collapse here without a ruling.
 *
 * **A member who joined after this session ended keeps a chip, muted, and says
 * why.** The read side of the card has the same problem the register does: an
 * unanswered chip on a card wearing a green check is unexplainable unless the
 * chip explains itself. Its screen-reader text says "joined later" in place of
 * "not marked", because "not marked" would name a gap that is not one — and
 * where such a member *does* carry a mark, the mark is what is read out, since
 * that is a real record of a real afternoon.
 */
export function AttendanceSummary({
  entry,
  roster,
  attendance,
}: {
  /** The session these chips are for — read only for its end instant. */
  entry: Pick<SessionFeedEntry, "endsAt">;
  roster: readonly SessionFeedGamer[];
  attendance: AttendanceMarks;
}) {
  const t = useTranslations("gedu.sessionFeed");

  if (roster.length === 0) return null;

  return (
    // Named list: the label is what a screen reader announces in place of the
    // removed summary line, and it is also what distinguishes this list from
    // the record editor's visible "Attendance" legend text in queries.
    <ul
      aria-label={t("attendanceLegend")}
      className="flex flex-wrap gap-1.5"
    >
      {roster.map((gamer) => {
        const mark = attendance[gamer.id];
        const expected = isExpectedOnEntry(entry, gamer);
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
              "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs",
              tone.border,
              tone.text,
              // A chip this session never wanted an answer for recedes, and the
              // mute wins over the tone: an unmarked chip that looks like every
              // other unmarked chip is the thing that makes a complete card
              // read as a mistake.
              expected ? undefined : "text-muted-foreground",
            )}
          >
            {expected || mark !== undefined ? (
              <MarkGlyph mark={mark} />
            ) : (
              <UserPlus className="h-3 w-3" aria-hidden />
            )}
            {/* A marked late joiner reads out BOTH: the mark first, because
                that is what the chip is chiefly saying, then the joined-later
                note, because otherwise the only signal that this chip sits
                outside the session's expectations is the mute — which is
                colour, and reaches nobody using a screen reader. */}
            <span className="sr-only">
              {mark === "present"
                ? t("presentLabel")
                : mark === "absent"
                  ? t("absentLabel")
                  : expected
                    ? t("unmarkedLabel")
                    : t("joinedLaterLabel")}
              {!expected && mark !== undefined ? ` ${t("joinedLaterLabel")}` : ""}
            </span>
            {gamer.firstName}
          </li>
        );
      })}
    </ul>
  );
}

function MarkGlyph({ mark }: { mark: "present" | "absent" | undefined }) {
  if (mark === "present") return <Check className="h-3 w-3" aria-hidden />;
  if (mark === "absent") return <X className="h-3 w-3" aria-hidden />;
  return <Minus className="h-3 w-3" aria-hidden />;
}
