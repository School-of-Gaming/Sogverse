import "server-only";

import { z } from "zod";

import { readPartnerPage } from "@/lib/api/partner-cursor.server";
import { Constants } from "@/types";
import type {
  PartnerEnrolment,
  PartnerEnrolmentStatus,
  PartnerEnrolmentsQuery,
} from "./partner.contracts";
import {
  IN_SCOPE_SEAT_COLUMNS,
  IN_SCOPE_SEAT_FILTER,
  readEffectiveStatuses,
} from "./partner-scope.server";
import type { PartnerDb } from "./partner-shared-db.server";
import {
  creationKey,
  readCreations,
  readRecordedSessionsByGroup,
  readSeatConsents,
} from "./partner-shared-lookups.server";
import {
  LIVE_SEAT_STATUSES,
  PROGRAMME_TERMS_SLUG,
  isLiveStatus,
  reportedEnrolmentStatus,
  toUtcIso,
} from "./partner-shared-values";

/**
 * `/enrolments`: one record per in-scope seat — a live seat on a Programme
 * product — paged by seat id.
 *
 * Every filter but one is a column of the seat and goes to the database as it
 * stands. The exception is `status`, which filters on the REPORTED value (D3),
 * and that value depends on the product's effective status, which the database
 * does not store. So the query narrows to the stored statuses that can report
 * the asked-for value, and `build` drops the seats whose product decided
 * otherwise: `status=active` fetches active seats and drops those on completed
 * products; `status=completed` fetches active and completed seats and drops the
 * active ones on products that have not completed.
 */

const EFFECTIVE_PRODUCT_STATUSES = Constants.public.Enums.effective_product_status;

/**
 * The stored seat statuses that can report `reported` under some product
 * status — derived from `reportedEnrolmentStatus` itself rather than written
 * out, so the query's narrowing cannot drift from the derivation `build`
 * applies after it. No filter asks for every live status.
 */
function storedStatusesReporting(
  reported: PartnerEnrolmentStatus | undefined,
): PartnerEnrolmentStatus[] {
  if (reported === undefined) return [...LIVE_SEAT_STATUSES];
  return LIVE_SEAT_STATUSES.filter((stored) =>
    EFFECTIVE_PRODUCT_STATUSES.some(
      (product) => reportedEnrolmentStatus(stored, product) === reported,
    ),
  );
}

const seatId = z.string().uuid();

export async function readEnrolments(
  db: PartnerDb,
  query: PartnerEnrolmentsQuery,
  now: Date,
): Promise<{ data: PartnerEnrolment[]; next_cursor: string | null }> {
  const fetchSeats = (after: string | null, take: number) => {
    let seats = db
      .from("participations")
      .select(IN_SCOPE_SEAT_COLUMNS, { count: "exact" })
      .in("status", storedStatusesReporting(query.status))
      .eq(IN_SCOPE_SEAT_FILTER, PROGRAMME_TERMS_SLUG);
    if (query.product_id !== undefined) seats = seats.eq("product_id", query.product_id);
    if (query.participant_id !== undefined) {
      seats = seats.eq("participant_id", query.participant_id);
    }
    if (query.parent_id !== undefined) seats = seats.eq("customer_id", query.parent_id);
    if (after !== null) seats = seats.gt("id", after);
    return seats.order("id").limit(take);
  };

  type Row = NonNullable<Awaited<ReturnType<typeof fetchSeats>>["data"]>[number];
  const keyOf = (row: Row) => row.id;

  const build = async (rows: Row[]): Promise<(PartnerEnrolment | null)[]> => {
    const productStatuses = await readEffectiveStatuses(
      db,
      rows.map((row) => row.product_id),
      now,
    );

    const reported = rows.map((row) => {
      // The query filters on live statuses, so this narrows a type and refuses
      // nothing the database did not already refuse.
      if (!isLiveStatus(row.status)) {
        throw new Error(`partner /enrolments: seat ${row.id} came back ${row.status}`);
      }
      const productStatus = productStatuses.get(row.product_id);
      if (productStatus === undefined) {
        throw new Error(
          `partner /enrolments: seat ${row.id} is on product ${row.product_id}, which has no status`,
        );
      }
      const status = reportedEnrolmentStatus(row.status, productStatus);
      return query.status === undefined || status === query.status ? status : null;
    });

    // Enriched only once the status filter has spoken, so a walk that drops
    // most of a batch does not pay for the records it drops.
    const kept = rows.filter((_, i) => reported[i] !== null);
    const placed = kept.flatMap((row) =>
      row.group_id === null
        ? []
        : [{ group_id: row.group_id, participant_id: row.participant_id }],
    );
    const [consents, sessionsByGroup, creations] = await Promise.all([
      readSeatConsents(db, kept, now),
      readRecordedSessionsByGroup(
        db,
        placed.map((pair) => pair.group_id),
      ),
      readCreations(db, placed),
    ]);

    return rows.map((row, i) => {
      const status = reported[i];
      if (status === null) return null;

      const seatConsents = consents.get(row.id);
      if (seatConsents === undefined) {
        throw new Error(`partner /enrolments: no consents resolved for seat ${row.id}`);
      }

      // The group's recorded sessions, including those before the participant
      // joined it — the count is the group's, as the page says. No group, no
      // sessions and no creations.
      const sessions =
        row.group_id === null ? [] : (sessionsByGroup.get(row.group_id) ?? []);
      const present = sessions.filter((session) =>
        session.attendance.some(
          (mark) => mark.participant_id === row.participant_id && mark.status === "present",
        ),
      ).length;

      return {
        id: row.id,
        product_id: row.product_id,
        group_id: row.group_id,
        participant_id: row.participant_id,
        parent_id: row.customer_id,
        status,
        signed_up_at: toUtcIso(row.signed_up_at),
        consents: seatConsents,
        attendance: {
          sessions_recorded: sessions.length,
          sessions_present: present,
        },
        creations:
          row.group_id === null
            ? []
            : (creations.get(creationKey(row.group_id, row.participant_id)) ?? []),
      };
    });
  };

  return readPartnerPage({
    resource: "enrolments",
    query,
    key: seatId,
    fetch: fetchSeats,
    keyOf,
    build,
  });
}
