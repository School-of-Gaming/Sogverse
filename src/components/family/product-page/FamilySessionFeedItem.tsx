"use client";

import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  SessionReport,
  type SessionLabels,
} from "@/components/gedu/session-feed";
import { cn } from "@/lib/utils";
import type { FamilySessionEntry } from "./types";

interface FamilySessionFeedItemProps {
  entry: FamilySessionEntry;
  labels: SessionLabels;
  /**
   * Whether this is the soonest session still ahead. Changes the tag's wording,
   * not its weight — every future session is tagged, because the boundary
   * between what has happened and what has not is the one thing a reader must
   * never have to work out from a date.
   */
  prominent: boolean;
  /**
   * Whether this session has started and not yet finished.
   *
   * Only a future entry can be one — a session in progress is still ahead of
   * the family in every sense that matters to them — and it swaps the tag's
   * wording for the one thing worth saying about it. "Next session" on a club
   * that is running right now is technically true and reads as a mistake.
   */
  live: boolean;
  /**
   * Whether to render the child's attendance mark at all.
   *
   * `false` on the gamer's own copy of this page. The mark is a parent-facing
   * signal — it exists so the adult paying for the club knows whether their
   * child turned up — and a child does not need their own page telling them
   * they were not there. It is the same data either way; who it is *for* is
   * what differs, so this is a rendering decision rather than a data one.
   */
  showAttendance: boolean;
}

/**
 * One row of the family feed: the session's date, what the gedu wrote about it,
 * and — on the parent's copy — whether this child was there.
 *
 * It is the gedu row's read-only sibling and shares its grammar deliberately:
 * same card, same date line, same quiet dashed line for a session nobody wrote
 * up. One deliberate divergence: **reports render in full, never clamped.** The
 * gedu clamps because their feed is a work queue — attendance sheets and
 * editors that last month's prose must not bury. Here the reports *are* the
 * page, the reader edits nothing, and the chunked past reveal already bounds
 * how much lands at once — so a Read-more would only put a tap between a
 * family and the thing they came to read. What it also does not share is
 * everything that made the gedu's row a workspace — no editor, no completeness
 * ladder, no amber "owed" state, no roster. Those are staff workflow, and a
 * family reading amber warnings about paperwork they cannot do anything about
 * would be reading the platform's problems rather than their child's club.
 *
 * **A past session with nothing on it renders as a quiet line, not a card.** No
 * report and no mark means there is genuinely nothing to say about that evening;
 * a full card holding one apologetic sentence would give an absence of
 * paperwork the same weight on the page as an actual write-up.
 */
export function FamilySessionFeedItem({
  entry,
  labels,
  prominent,
  live,
  showAttendance,
}: FamilySessionFeedItemProps) {
  const t = useTranslations("familyProduct");

  const attendance =
    entry.kind === "past" && showAttendance ? entry.attendance : null;
  const hasReport = entry.report !== null && entry.report.length > 0;

  // Nothing written and nothing to say about who was there — the one row that
  // is not a card. It still carries its date, because the session did happen
  // and a family scrolling the term should see the week is not missing.
  if (entry.kind === "past" && !hasReport && attendance === null) {
    return (
      <div className="rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="flex items-center gap-2 tabular-nums">
            <span>{labels.date}</span>
            <span className="opacity-70">{labels.timeRange}</span>
          </span>
          <span>{t("noWriteUp")}</span>
        </div>
      </div>
    );
  }

  return (
    <Card
      className={cn(
        "p-4 sm:p-5",
        entry.kind === "future" && prominent && "border-info/50",
      )}
    >
      {/* The header row is date on the left and one status on the right, and
          which status it is follows the side of the present the entry is on: a
          tag ahead of now, an attendance mark behind it. They can never both
          be there, so the row never has to reserve space for the other one. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">{labels.date}</p>
          <p className="text-xs tabular-nums text-muted-foreground">
            {labels.timeRange}
            {labels.timeZoneAbbrev !== null && (
              <span className="ml-1.5">{labels.timeZoneAbbrev}</span>
            )}
          </p>
        </div>

        {entry.kind === "future" && (
          // FUTURE FEED ROW — not permanently read-only.
          //
          // A parent-facing **planned absence** ("she has a dentist
          // appointment, she'll miss the 14th") is a designed-for feature that
          // is expected to land on exactly this row: it is the only place in
          // the product where a family is already looking at a specific future
          // occurrence of their own child's club. Nothing is built for it here
          // and no space is held for it — but whoever adds it should know this
          // row was written expecting them, and that its right-hand slot is
          // where the affordance is meant to go.
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 text-[10px] uppercase tracking-wide",
              live
                ? "border-info bg-info/10 text-info"
                : "border-info/50 text-info",
            )}
          >
            {live
              ? t("liveBadge")
              : prominent
                ? t("nextSessionBadge")
                : t("futureBadge")}
          </Badge>
        )}

        {attendance !== null && <AttendanceMarkChip mark={attendance} />}
      </div>

      {hasReport && (
        <SessionReport
          markdown={entry.report ?? ""}
          clamped={false}
          className="pt-3"
        />
      )}
    </Card>
  );
}

/**
 * Whether this child was at this session — and the most carefully toned thing
 * on the page.
 *
 * **"Present" is a small positive; "Not present" is muted and neutral, never
 * destructive.** The reason is in the data, not in the design: the attendance
 * enum is currently `present | absent` and nothing more, so an absence the
 * parent arranged in advance (a holiday, an appointment, an ill child kept at
 * home) is stored identically to a child who simply never turned up. A red or
 * warning-toned mark would have this page editorialise a distinction it cannot
 * actually make, and it would do so to the parent who arranged the absence
 * themselves.
 *
 * A `planned_absent` value — marked by the parent, in advance, from the future
 * row above — is a planned addition to that enum. When it lands, this single
 * neutral mark splits into two calmer and more specific renderings ("Away —
 * let us know" versus something the family told us about beforehand), and the
 * wording chosen here stops having to cover both cases at once.
 *
 * **An unmarked session renders nothing at all**, which is why there is no third
 * branch here: the caller passes `null` and no chip exists. A gap in the gedu's
 * register is not a fact about a child, and a family shown "not marked" would
 * read it as one.
 */
function AttendanceMarkChip({ mark }: { mark: "present" | "absent" }) {
  const t = useTranslations("familyProduct");
  const present = mark === "present";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium",
        present ? "text-success" : "text-muted-foreground",
      )}
    >
      {present ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <Minus className="h-3.5 w-3.5" aria-hidden />
      )}
      {present ? t("attendancePresent") : t("attendanceNotPresent")}
    </span>
  );
}
