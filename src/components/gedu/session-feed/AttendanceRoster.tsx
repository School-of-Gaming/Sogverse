"use client";

import { Check, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AttendanceMark } from "@/components/session-feed";
import { isExpectedOnEntry } from "./entry-state";
import type { AttendanceMarks, SessionFeedEntry, SessionFeedGamer } from "./types";

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
 *
 * **A member who joined the group after this session ended keeps their row,
 * muted and labelled, and stays markable.** Three separate decisions, each
 * doing its own work. The row is not dropped, because a mark may legitimately
 * exist for that member on that session — a trial visit, or one of the false
 * absences gedus were forced to record before this rule existed — and a
 * vanishing row takes the only visible record of it with it. It stays markable,
 * because a gedu who genuinely wants to say something about that member must
 * not be refused. And it is muted and labelled because it is the one row that
 * may sit unanswered on a card announcing itself complete, which without a
 * label is simply unexplainable to whoever is looking at it.
 *
 * Nothing here is decided after first paint: the roster and the session arrive
 * together, so the label is in its final position from the first frame and no
 * row moves under a gedu who is marking.
 */
export function AttendanceRoster({
  entry,
  roster,
  attendance,
  disabled = false,
  onMark,
}: {
  /**
   * The session this register is for — read only for its end instant, which is
   * what decides who it expected.
   */
  entry: Pick<SessionFeedEntry, "endsAt">;
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
        const expected = isExpectedOnEntry(entry, gamer);
        /** Pressing the pill that is already on clears the row. */
        const toggle = (value: AttendanceMark) =>
          onMark(gamer.id, mark === value ? undefined : value);

        return (
          <li
            key={gamer.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md border border-border px-2.5 py-1.5",
              // An unmarked row is the one that still wants something from you,
              // so it is the one that doesn't fade into the panel behind it —
              // unless this session never wanted it, in which case the row is
              // exactly the one that should recede.
              mark === undefined && expected ? "bg-transparent" : "bg-lifted",
            )}
          >
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-sm",
                expected ? undefined : "text-muted-foreground",
              )}
            >
              <span className="min-w-0 truncate">{gamer.firstName}</span>
              {/* Beside the name rather than under it: the row is one line and
                  the pills own the other end of it, so the label takes the
                  slack in the middle and nothing below the row moves. Both
                  halves shrink, proportionally to their base widths, so which
                  one gives way first depends on which is longer — in the
                  locales that matter the label usually is, which is the way
                  round we want, since a truncated label still reads while a
                  truncated name identifies nobody. It is not pinned that way
                  on purpose: forcing it would let a long name overflow the row
                  rather than truncate, which is the worse failure. */}
              {!expected && (
                <span className="inline-flex min-w-0 shrink items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
                  <UserPlus className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{t("joinedLaterLabel")}</span>
                </span>
              )}
            </span>
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
                // Pressed is the one place a status hue is a ground rather
                // than a figure, and it is a full-value fill under the ink the
                // pairing measured: a wash of the same green is not that green.
                pressedClassName="bg-success text-success-foreground"
              />
              <MarkOption
                pressed={mark === "absent"}
                disabled={disabled}
                onToggle={() => toggle("absent")}
                label={t("absentLabel")}
                icon={<X className="h-3 w-3" aria-hidden />}
                // Neutral rather than destructive: an absence is a fact about
                // the afternoon, not an error the gedu made. Neutral still has
                // to *read* as chosen, though — and a marked row is already
                // `bg-lifted`, so a pill on the same grey is invisible. `border`
                // is the one neutral above lifted, which makes the pill read as
                // filled under full-strength foreground ink without borrowing an
                // alarm colour it hasn't earned.
                pressedClassName="bg-border text-foreground"
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 focus-visible:ring-offset-background",
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
