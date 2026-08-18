"use client";

import { Check, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ATTENDANCE_TONE,
  SessionReport,
  hasReport,
  type AttendanceMark,
  type SessionLabels,
} from "@/components/session-feed";
import { cn } from "@/lib/utils";
import { PersonChip } from "@/components/ui/person-chip";
import type { FamilySessionEntry } from "./types";

// TEMP(report-attribution): preview-only variant switch for UI alignment.
// Remove before the real implementation.
export type ReportAttributionVariant =
  | "none"
  | "corner"
  | "corner-left"
  | "corner-bottom"
  | "byline"
  | "signature";

// TEMP(report-attribution): where each corner variant's chip is pinned on the
// relative shell. Absence from this map is what makes a variant not a corner.
const CORNER_ATTRIBUTION_POSITIONS: Partial<
  Record<ReportAttributionVariant, string>
> = {
  corner: "-right-2 -top-2.5",
  "corner-left": "-left-2 -top-2.5",
  "corner-bottom": "-right-2 -bottom-2.5",
};

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
  // TEMP(report-attribution): preview-only. Remove before the real
  // implementation.
  attributionVariant?: ReportAttributionVariant;
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
  attributionVariant = "none",
}: FamilySessionFeedItemProps) {
  const t = useTranslations("familyProduct");
  const b = useTranslations("sessionBadge");

  // TEMP(report-attribution): preview-only.
  const author =
    attributionVariant !== "none" ? (entry.reportAuthor ?? null) : null;

  const attendance =
    entry.kind === "past" && showAttendance ? entry.attendance : null;
  // The shared trimmed test, which the feed's own quiet-row check also calls:
  // a report of whitespace is no report, and must fall through to the quiet
  // dashed line rather than rendering a full card around an empty body.
  const written = hasReport(entry.report);

  // Nothing written and nothing to say about who was there — the one row that
  // is not a card. It still carries its date, because the session did happen
  // and a family scrolling the term should see the week is not missing.
  if (entry.kind === "past" && !written && attendance === null) {
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

  // TEMP(report-attribution): the card is wrapped in a relative shell so the
  // corner variant's chip can straddle the corner without being clipped.
  const card = (
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
              ? b("live")
              : prominent
                ? b("nextSession")
                : b("upcoming")}
          </Badge>
        )}

        {attendance !== null && <AttendanceMarkChip mark={attendance} />}
      </div>

      {/* TEMP(report-attribution): byline variant — chip above the report. */}
      {written && author !== null && attributionVariant === "byline" && (
        <div className="pt-3">
          <PersonChip id={author.id} name={author.firstName} size="compact" />
        </div>
      )}

      {written && (
        <SessionReport
          markdown={entry.report ?? ""}
          clamped={false}
          className={
            attributionVariant === "byline" && author !== null ? "pt-2" : "pt-3"
          }
        />
      )}

      {/* TEMP(report-attribution): signature variant — chip below the report. */}
      {written && author !== null && attributionVariant === "signature" && (
        <div className="pt-2">
          <PersonChip id={author.id} name={author.firstName} size="compact" />
        </div>
      )}
    </Card>
  );

  // TEMP(report-attribution): corner variants — chip straddling the top-right,
  // top-left or bottom-right corner, borrowing the card-corner-badge geometry
  // (ring cut-out, half off the edge). Rendered as the card's sibling inside a
  // relative shell so the card's own overflow cannot clip it.
  const cornerPosition = CORNER_ATTRIBUTION_POSITIONS[attributionVariant];
  if (cornerPosition !== undefined && written && author !== null) {
    return (
      <div className="relative">
        {card}
        <PersonChip
          id={author.id}
          name={author.firstName}
          size="default"
          className={cn(
            "absolute z-10 bg-card shadow-sm ring-2 ring-background",
            cornerPosition,
          )}
        />
      </div>
    );
  }

  return card;
}

/**
 * Whether this child was at this session — and the most carefully toned thing
 * on the page.
 *
 * **The tone is the shared one**, not a decision made here: "present" is a small
 * positive, "not present" is muted and neutral and never destructive, and the
 * reason lives with the token map along with what happens to it when a
 * `planned_absent` value lands. The glyph is this chip's own, because this set
 * has two states and the gedu's register has three — the dash is free here and
 * spoken for there.
 *
 * The *wording* still has to cover both kinds of absence at once, since the enum
 * cannot yet tell an arranged one from a no-show; that is the same constraint
 * the tone is chosen under, and it eases in the same change.
 *
 * **An unmarked session renders nothing at all**, which is why there is no third
 * branch here: the caller passes `null` and no chip exists. A gap in the gedu's
 * register is not a fact about a child, and a family shown "not marked" would
 * read it as one.
 */
function AttendanceMarkChip({ mark }: { mark: AttendanceMark }) {
  const t = useTranslations("familyProduct");
  const present = mark === "present";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium",
        ATTENDANCE_TONE[mark].text,
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
