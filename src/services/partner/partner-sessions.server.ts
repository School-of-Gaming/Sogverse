import "server-only";

import { z } from "zod";

import { readPartnerPage } from "@/lib/api/partner-cursor.server";
import { sessionImageUrl } from "@/lib/images/session-image-url";
import { chunkKeys, walkPages } from "@/lib/supabase/paging";
import {
  ATTENDANCE_MARK,
  type PartnerAttendanceMark,
  type PartnerSession,
  type PartnerSessionsQuery,
} from "./partner.contracts";
import type { PartnerDb } from "./partner-shared-db.server";
import {
  PROGRAMME_TERMS_SLUG,
  isRecordedSession,
  toUtcIso,
} from "./partner-shared-values";

/**
 * `/sessions` — what happened in each Programme group: every recorded session
 * (D6) with its attendance marks and report photographs, paged by session id.
 */

/**
 * The embed that scopes a `group_sessions` select to the Programme, without a
 * product id list in the URL: an inner join through the session's group to its
 * product, and on to that product's requirement of the Programme's terms,
 * filtered on `SESSION_SCOPE_FILTER`. Every `!inner` is load-bearing — without
 * one, the filter narrows only an embedded value and every session still comes
 * back. The group's `product_id` rides along, as the record's `product_id` and
 * as the column the `product_id` filter narrows.
 */
const SESSION_SCOPE_EMBED =
  "group:product_groups!inner(product_id, product:products!inner(programme_terms:product_required_consents!inner(document_slug)))";
const SESSION_SCOPE_FILTER = "group.product.programme_terms.document_slug";

const SESSION_COLUMNS = `id, group_id, starts_at, ends_at, report, ${SESSION_SCOPE_EMBED}`;

type Attendance = PartnerSession["attendance"];
type Images = PartnerSession["images"];

function isAttendanceMark(status: string): status is PartnerAttendanceMark {
  return (ATTENDANCE_MARK as readonly string[]).includes(status);
}

/**
 * Each session's attendance marks, keyed by session id, ascending by
 * participant. Chunked for the URL and walked for the rows: a session carries a
 * mark per child on the roster, so a chunk of sessions is not a bound on what
 * comes back.
 */
async function readAttendance(
  db: PartnerDb,
  sessionIds: readonly string[],
): Promise<Map<string, Attendance>> {
  const marks = new Map<string, Attendance>();
  for (const chunk of chunkKeys(sessionIds)) {
    const rows = await walkPages("partner session attendance", (from, to) =>
      db
        .from("session_attendance")
        .select("session_id, participant_id, status", { count: "exact" })
        .in("session_id", chunk)
        .order("session_id")
        .order("participant_id")
        .range(from, to),
    );
    for (const row of rows) {
      // The table's CHECK admits exactly these two; narrowed, not filtered.
      if (!isAttendanceMark(row.status)) {
        throw new Error(
          `partner session attendance: session ${row.session_id} carries status ${row.status}`,
        );
      }
      const list = marks.get(row.session_id) ?? [];
      list.push({ participant_id: row.participant_id, status: row.status });
      marks.set(row.session_id, list);
    }
  }
  return marks;
}

/**
 * Each session's report photographs, keyed by session id, in the order they
 * were added — `(created_at, id)`, the order every renderer of a report uses.
 * Chunked and walked, as the marks are.
 */
async function readImages(
  db: PartnerDb,
  sessionIds: readonly string[],
): Promise<Map<string, Images>> {
  const images = new Map<string, Images>();
  for (const chunk of chunkKeys(sessionIds)) {
    const rows = await walkPages("partner session images", (from, to) =>
      db
        .from("group_session_images")
        .select("id, session_id, width, height", { count: "exact" })
        .in("session_id", chunk)
        .order("session_id")
        .order("created_at")
        .order("id")
        .range(from, to),
    );
    for (const row of rows) {
      const list = images.get(row.session_id) ?? [];
      list.push({
        id: row.id,
        url: sessionImageUrl(row.id),
        width: row.width,
        height: row.height,
      });
      images.set(row.session_id, list);
    }
  }
  return images;
}

/**
 * One page of recorded Programme sessions, ascending by session id.
 *
 * The scope, `product_id`, `group_id` and the date range are all database
 * filters. `from`/`to` compare `session_date`, which is already the session's
 * calendar day in its product's timezone (D7) — the day the group's schedule
 * put it on — so no conversion is needed or wanted.
 *
 * **Whether a session is recorded (D6) is decided in the build, not the
 * fetch.** "A non-blank report or at least one attendance mark" is an `or`
 * across a trimmed column and the existence of child rows, which a PostgREST
 * filter cannot state, so the page reader walks every session the filters match
 * and the build drops the ones that were only ever a staff note or a
 * photograph. The keyset stays exact because the cursor is a position in that
 * one order, recorded or not. The marks read for the decision are the marks the
 * record reports, so the two can never disagree.
 */
export async function readPartnerSessions(
  db: PartnerDb,
  query: PartnerSessionsQuery,
): Promise<{ data: PartnerSession[]; next_cursor: string | null }> {
  const keyOf = (row: { id: string }) => row.id;

  return readPartnerPage({
    resource: "sessions",
    query,
    key: z.string().uuid(),
    keyOf,
    fetch: (after, take) => {
      let select = db
        .from("group_sessions")
        .select(SESSION_COLUMNS, { count: "exact" })
        .eq(SESSION_SCOPE_FILTER, PROGRAMME_TERMS_SLUG);
      if (query.product_id !== undefined) {
        select = select.eq("group.product_id", query.product_id);
      }
      if (query.group_id !== undefined) select = select.eq("group_id", query.group_id);
      if (query.from !== undefined) select = select.gte("session_date", query.from);
      if (query.to !== undefined) select = select.lte("session_date", query.to);
      if (after !== null) select = select.gt("id", after);
      return select.order("id").limit(take);
    },
    build: async (rows) => {
      const attendance = await readAttendance(
        db,
        rows.map((row) => row.id),
      );
      const recorded = rows.filter((row) =>
        isRecordedSession(row.report, attendance.get(row.id)?.length ?? 0),
      );
      const images = await readImages(
        db,
        recorded.map((row) => row.id),
      );

      const recordedIds = new Set(recorded.map((row) => row.id));
      return rows.map((row): PartnerSession | null => {
        if (!recordedIds.has(row.id)) return null;
        return {
          id: row.id,
          product_id: row.group.product_id,
          group_id: row.group_id,
          starts_at: toUtcIso(row.starts_at),
          ends_at: toUtcIso(row.ends_at),
          attendance: attendance.get(row.id) ?? [],
          images: images.get(row.id) ?? [],
        };
      });
    },
  });
}
