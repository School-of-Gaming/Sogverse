"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AttendanceMark, AttendanceMarks, SessionFeedGamer } from "./types";

/**
 * The per-gamer attendance sheet: one row per child, each with an explicit
 * **Present / Absent** choice and a genuine third state — unmarked.
 *
 * A checkbox cannot express that third state, which is why this isn't one. An
 * unticked box reads as "absent" to the person looking at it and as "nobody has
 * said yet" to the person who wrote the code, and the whole record then means
 * whichever of those the reader assumed. Two mutually exclusive options that
 * both start unchosen make the distinction visible: an unmarked row is plainly
 * unanswered, and the editor above refuses to save until none are left.
 *
 * Each row is a native radio group, so a keyboard user gets arrow-key selection,
 * focus handling and the right screen-reader semantics for free — the visible
 * pills are styled siblings of visually-hidden inputs rather than buttons
 * pretending to be radios.
 */
export function AttendanceRoster({
  roster,
  attendance,
  namePrefix,
  onMark,
}: {
  roster: readonly SessionFeedGamer[];
  attendance: AttendanceMarks;
  /** Unique per editor instance — radio `name`s must not collide on a page. */
  namePrefix: string;
  onMark: (gamerId: string, mark: AttendanceMark) => void;
}) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <ul className="space-y-1.5">
      {roster.map((gamer) => {
        const mark = attendance[gamer.id];
        return (
          <li
            key={gamer.id}
            className={cn(
              "flex items-center justify-between gap-3 rounded-md border px-2.5 py-1.5",
              // An unmarked row is the one that still wants something from you,
              // so it is the one that doesn't fade into the panel behind it.
              mark === undefined
                ? "border-border bg-transparent"
                : "border-transparent bg-muted/40",
            )}
          >
            <span className="min-w-0 truncate text-sm">{gamer.firstName}</span>
            <div
              role="radiogroup"
              aria-label={t("attendanceForGamer", { name: gamer.firstName })}
              className="flex shrink-0 items-center gap-1"
            >
              <MarkOption
                name={`${namePrefix}-${gamer.id}`}
                selected={mark === "present"}
                onSelect={() => onMark(gamer.id, "present")}
                label={t("presentLabel")}
                icon={<Check className="h-3 w-3" aria-hidden />}
                selectedClassName="border-success/50 bg-success/10 text-success"
              />
              <MarkOption
                name={`${namePrefix}-${gamer.id}`}
                selected={mark === "absent"}
                onSelect={() => onMark(gamer.id, "absent")}
                label={t("absentLabel")}
                icon={<X className="h-3 w-3" aria-hidden />}
                // Neutral rather than destructive: an absence is a fact about
                // the afternoon, not an error the gedu made.
                selectedClassName="border-muted-foreground/50 bg-muted text-foreground"
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function MarkOption({
  name,
  selected,
  onSelect,
  label,
  icon,
  selectedClassName,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
  label: string;
  icon: React.ReactNode;
  selectedClassName: string;
}) {
  return (
    <label className="relative inline-flex cursor-pointer">
      <input
        type="radio"
        name={name}
        checked={selected}
        onChange={onSelect}
        className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
      />
      <span
        className={cn(
          "pointer-events-none inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
          selected
            ? selectedClassName
            : "border-border text-muted-foreground peer-hover:text-foreground",
        )}
      >
        {icon}
        {label}
      </span>
    </label>
  );
}
