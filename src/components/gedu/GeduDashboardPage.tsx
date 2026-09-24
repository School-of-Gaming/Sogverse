"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";
import { HelpRequestCard } from "@/components/help/help-request-card";
import { MinecraftPasswordResetCard } from "@/components/tools/minecraft-password-reset-card";
import { CreateInstantRoomCard } from "@/components/voice/instant/CreateInstantRoomCard";
import {
  formatProductSchedule,
  scheduleCardLines,
} from "@/lib/products/format-product-schedule";
import { resolveLocale } from "@/lib/constants/locales";
import {
  geduAssignmentKey,
  rollUpGeduAssignments,
  rollUpGeduSubstitutions,
  type GeduSubstitutionSummary,
} from "@/lib/gedu-assignment-rollup";
import { useNow, useTimezone } from "@/providers";
import {
  useMyAssignedProducts,
  type MyAssignedProductSessionRow,
} from "@/services/assignments";
import {
  useGeduAssignmentSummaries,
  type GeduAssignmentSummary,
} from "@/services/gedu-sessions";
import {
  geduSeatHrefs,
  geduSubstitutionAttention,
  joinGeduSeatRows,
} from "./gedu-seat-rows";
import { GeduDashboardPageBody } from "./gedu-dashboard-page-body";
import { GeduDashboardSkeleton } from "./GeduDashboardSkeleton";
import type { GeduAssignmentCardData } from "./GeduAssignmentsSectionView";

/**
 * The gedu dashboard's data shell: two reads, one join, one roll-up.
 *
 * **Two reads, because they answer two different questions and only one of them
 * is cheap to widen.** The assignment rows carry the product shell and its
 * schedule — everything the *next session* line and the cadence line are
 * derived from — and they are the same rows every other gedu surface reads. The
 * summary RPC carries the three facts that belong to the assignment rather than
 * the product: the gedu's own group's name, how many children are in it, and
 * how many past sessions of it still owe a register or a report. Joining them
 * here rather than fusing the two RPCs keeps the expensive half (a
 * per-assignment attention count over the whole schedule) in one function that
 * only this page calls.
 *
 * **The dashboard never fetches a feed.** A page of six cards would otherwise
 * be six clubs' entire histories downloaded to render six numbers. The count
 * comes back with the summary, computed server-side against the same weekday
 * expansion the workspace's feed uses, floored at the same epoch and applying
 * the same two-part test — a finished session is owed until its register is
 * complete **and** a report has been written — so the badge on the card and the
 * alerts in the feed behind it are two views of one number. The report half is
 * the newer of the two conditions and is the one to check first if they ever
 * disagree.
 *
 * Both reads are server-prefetched by the route, so the ordinary visit paints
 * complete on the first frame with no loading state at all.
 *
 * **The open substitution queue is not here.** It is other people's absences,
 * and it has a page of its own at `/gedu/substitutions` — what stays on My SOG
 * is a substitution this gedu has already taken, because that is a session in
 * their own week.
 */
export function GeduDashboardPage({
  initialRows,
  initialSummaries,
  certified,
  contractAccepted,
  criminalRecordCheckPassed,
}: {
  initialRows: MyAssignedProductSessionRow[];
  /**
   * The prefetched summaries, or `null` when that read failed. `null` is not
   * an empty list: it means "ask again from the browser", and the page shows
   * its skeleton until the answer arrives rather than rendering cards whose
   * group names and badges it does not yet know.
   */
  initialSummaries: GeduAssignmentSummary[] | null;
  certified: boolean;
  /**
   * Has this gedu accepted the contract version in force? Resolved by the
   * route, not read here, so the notice band is decided before the first paint
   * — it sits above every section, and one that landed later would push the
   * whole page down under the reader.
   */
  contractAccepted: boolean;
  /**
   * Has an admin recorded seeing this gedu's criminal record extract? Resolved
   * by the route for the same reason as `contractAccepted`: it decides a band
   * that sits above every section, and an answer arriving after the first paint
   * would push the whole dashboard down under the reader.
   */
  criminalRecordCheckPassed: boolean;
}) {
  const locale = resolveLocale(useLocale());
  const timeZone = useTimezone();
  const now = useNow();

  const { data: rows } = useMyAssignedProducts({ initialData: initialRows });
  const { data: summaries } = useGeduAssignmentSummaries(
    initialSummaries === null ? undefined : { initialData: initialSummaries },
  );
  const cards = useMemo(
    () =>
      summaries === undefined
        ? null
        : buildDashboardCards({ rows, summaries, locale, timeZone, now }),
    [rows, summaries, locale, timeZone, now],
  );

  if (cards === null)
    return (
      <GeduDashboardSkeleton
        contractAccepted={contractAccepted}
        criminalRecordCheckPassed={criminalRecordCheckPassed}
        certified={certified}
      />
    );

  return (
    <GeduDashboardPageBody
      assignments={cards.assignments}
      substitutions={cards.substitutions}
      certified={certified}
      contractAccepted={contractAccepted}
      criminalRecordCheckPassed={criminalRecordCheckPassed}
      toolsCard={<MinecraftPasswordResetCard />}
      instantRoomCard={<CreateInstantRoomCard />}
      // The adult wording — a gedu is written to in the same register a parent
      // is; only a child's copy forks.
      helpForm={<HelpRequestCard audience="adult" />}
    />
  );
}

/**
 * Join the two reads and roll them up into the cards this page draws — one per
 * standing assignment, and one per live substitution.
 *
 * **The join is on (group, kind, substitution date), because that is what a seat
 * is.** A gedu holds at most one *assignment* per product, which is what used
 * to make group id alone sufficient; since substitutions exist, one group can be both
 * somebody's assignment and somebody's substituted Monday, and two substituted Mondays
 * of one group are two rows. A row with no matching summary still renders — a
 * card missing its group name is a worse answer than no card only if you think
 * the gedu came here for the group name, and they came for the next session —
 * so the missing facts fall back rather than dropping the seat.
 */
function buildDashboardCards(args: {
  rows: MyAssignedProductSessionRow[];
  summaries: GeduAssignmentSummary[];
  locale: ReturnType<typeof resolveLocale>;
  timeZone: string;
  now: Date;
}): { assignments: GeduAssignmentCardData[]; substitutions: GeduSubstitutionSummary[] } {
  const { rows, summaries, locale, timeZone, now } = args;

  const seatRows = joinGeduSeatRows(rows, summaries);
  const { hrefByAssignment, voiceHrefByAssignment } = geduSeatHrefs(rows);

  const assignments = rollUpGeduAssignments({
    rows: seatRows,
    now,
    locale,
    attentionByAssignment: Object.fromEntries(
      summaries
        .filter((s) => s.kind === "assignment")
        .map((s) => [geduAssignmentKey(s.product_id, s.group_id), s.attention_count]),
    ),
    hrefByAssignment,
    voiceHrefByAssignment,
  });

  const substitutions = rollUpGeduSubstitutions({
    rows: seatRows,
    locale,
    attentionBySubstitution: geduSubstitutionAttention(summaries),
    hrefByAssignment,
    voiceHrefByAssignment,
  });

  const rowsById = new Map(rows.map((row) => [row.product.id, row]));

  const assignmentCards = assignments.map((assignment) => {
    const row = rowsById.get(assignment.productId);
    return {
      assignment,
      // The cadence in words, from the same formatter the public browse cards
      // use — so "Mondays 16:30–18:00" reads identically wherever it appears,
      // and in the viewer's zone wherever it appears.
      scheduleLines:
        row === undefined
          ? []
          : scheduleCardLines(
              formatProductSchedule({
                product: {
                  product_type: row.product.productType,
                  start_date: row.product.startDate,
                  end_date: row.product.endDate,
                  timezone: row.product.timezone,
                  schedule_slots: row.slots.map((slot) => ({
                    weekday: slot.weekday,
                    start_time: slot.startTime,
                    duration_minutes: slot.durationMinutes,
                  })),
                },
                locale,
                timeZone,
                now,
              }),
            ),
    };
  });

  return { assignments: assignmentCards, substitutions };
}
