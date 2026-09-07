"use client";

import { Check, X } from "lucide-react";
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
 * **A member who joined the group after this session ended gets no row at all.**
 * The register shipped once with such a row present, muted and labelled "joined
 * later", on the argument that a stored mark for that member needed somewhere
 * to show itself. The owner ruled that out: telling a gedu that Juha joined
 * late, on a session that ran six months before Juha existed on the roster, is
 * a sentence with nothing behind it. A session's register is for the people the
 * session was for, and a name that was never on it is noise on every card older
 * than that member's arrival — which, on a group that has grown, is most of the
 * feed.
 *
 * **The omission is a rendering decision and stops here.** It must never travel
 * into `rosterScopedMarks`, which the editor calls on the way *into* storage
 * with the FULL roster: narrowing that one to the expected members would delete
 * a mark a gedu legitimately made for a late joiner — a trial visit, or one of
 * the false absences gedus were forced to record before this rule existed — on
 * the next save of the session. Not being asked about is not the same as not
 * being in the group, and only the second is grounds for dropping a mark. Do
 * not "simplify" the two rosters into one.
 *
 * **A session that expected nobody draws no list at all**, rather than an empty
 * one. That is reachable — a group formed mid-term has occurrences every seat
 * postdates — and the caller pairs it with a line saying why, because a silent
 * gap under a heading is not an answer.
 *
 * Nothing here is decided after first paint: the roster and the session arrive
 * together, so the rows are the rows from the first frame and none of them
 * moves under a gedu who is marking.
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

  // The rows are the members this session expected, and this list is used for
  // nothing else — the caller keeps handing the full roster to the draft's
  // storage scoping, which is what preserves a late joiner's stored mark. See
  // the note above the component.
  const expected = roster.filter((gamer) => isExpectedOnEntry(entry, gamer));

  // No rows, no list. A group formed mid-term can have a session every seat
  // postdates, and a `<ul>` with no children is a zero-height element that
  // still reads to assistive technology as an empty list — a heading's worth of
  // structure standing for nothing.
  //
  // The sibling that draws the read-side chips returns null on the same test,
  // so the card and the editor fall silent together. The caller does the other
  // half: the editor drops the count and the hint above this and says in one
  // line why there is no register, which is the sentence a gedu can act on and
  // is not this component's to write.
  if (expected.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {expected.map((gamer) => {
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
              mark === undefined ? "bg-transparent" : "bg-lifted",
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-sm">
              <span className="min-w-0 truncate">{gamer.firstName}</span>
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
