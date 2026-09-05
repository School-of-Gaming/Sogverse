"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AttendanceMark } from "@/components/session-feed";
import type { AttendanceMarks, SessionFeedGamer } from "./types";

/**
 * The per-gamer attendance sheet: one row per child, each with an explicit
 * **Present / Absent** choice and a genuine third state — unmarked.
 *
 * A checkbox cannot express that third state, which is why this isn't one. An
 * unticked box reads as "absent" to the person looking at it and as "nobody has
 * said yet" to the person who wrote the code, and the whole record then means
 * whichever of those the reader assumed. Two mutually exclusive options that
 * both start unchosen make the distinction visible: an unmarked row is plainly
 * unanswered, and it stays that way through a save. **A partial sheet saves as
 * itself** — the gedu interrupted three children in keeps their three marks, the
 * other five stay unanswered rather than being padded into absences, and the
 * entry goes on flagging itself until somebody finishes it.
 *
 * **The pills are `aria-pressed` toggle buttons, not radios.** A mark has to be
 * revertable — a gedu who taps Absent on the wrong child must be able to put
 * that row back to unanswered rather than being forced to choose the other
 * wrong answer. Radios have no gesture for that in any assistive technology:
 * re-activating a checked radio is a no-op by definition, so "click it again to
 * clear it" would have been a mouse-only affordance bolted onto a control whose
 * announced semantics said otherwise. A toggle button already means "on or off",
 * so pressing a pressed pill clearing the mark is the control behaving exactly
 * as it is announced, with Space and Enter doing it from the keyboard. The two
 * pills sit in a `role="group"` named after the child, so a screen-reader user
 * still hears whose attendance they are on; what they lose against a radiogroup
 * is arrow-key traversal, which costs one extra Tab per child.
 */
export function AttendanceRoster({
  roster,
  attendance,
  disabled = false,
  onMark,
}: {
  roster: readonly SessionFeedGamer[];
  attendance: AttendanceMarks;
  /**
   * Lock every pill while the sheet is being saved. The marks stay on screen
   * exactly as they are — a save that fails gives the gedu back the sheet they
   * had, not a blank one.
   */
  disabled?: boolean;
  /** `undefined` clears the mark, returning the row to unanswered. */
  onMark: (gamerId: string, mark: AttendanceMark | undefined) => void;
}) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <ul className="space-y-1.5">
      {roster.map((gamer) => {
        const mark = attendance[gamer.id];
        /** Pressing the pill that is already on clears the row. */
        const toggle = (value: AttendanceMark) =>
          onMark(gamer.id, mark === value ? undefined : value);

        return (
          <li
            key={gamer.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md border border-border px-2.5 py-1.5",
              // An unmarked row is the one that still wants something from you,
              // so it is the one that doesn't fade into the panel behind it.
              mark === undefined ? "bg-transparent" : "bg-muted/30",
            )}
          >
            <span className="min-w-0 truncate text-sm">{gamer.firstName}</span>
            <div
              role="group"
              aria-label={t("attendanceForGamer", { name: gamer.firstName })}
              className="flex shrink-0 items-center gap-1"
            >
              <MarkOption
                pressed={mark === "present"}
                disabled={disabled}
                onToggle={() => toggle("present")}
                label={t("presentLabel")}
                icon={<Check className="h-3 w-3" aria-hidden />}
                pressedClassName="bg-success/20 text-success"
              />
              <MarkOption
                pressed={mark === "absent"}
                disabled={disabled}
                onToggle={() => toggle("absent")}
                label={t("absentLabel")}
                icon={<X className="h-3 w-3" aria-hidden />}
                // Neutral rather than destructive: an absence is a fact about
                // the afternoon, not an error the gedu made. Neutral still has
                // to *read* as chosen, though — a plain `bg-muted` pill sitting
                // on a muted row was near-invisible, so the selected state is a
                // foreground-tinted fill under full-strength foreground ink,
                // which lands as unmistakably filled without borrowing an alarm
                // colour it hasn't earned.
                pressedClassName="bg-foreground/15 text-foreground"
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MarkOption({
  pressed,
  disabled,
  onToggle,
  label,
  icon,
  pressedClassName,
}: {
  pressed: boolean;
  disabled: boolean;
  onToggle: () => void;
  label: string;
  icon: React.ReactNode;
  pressedClassName: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        pressed
          ? cn("font-semibold", pressedClassName)
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
