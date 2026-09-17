import "server-only";

import { z } from "zod";

import { keysetAfter, readPartnerPage } from "@/lib/api/partner-cursor.server";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { productLocalDate } from "@/lib/session-occurrence";
import {
  EXIT_REASON,
  type PartnerExitReason,
  type PartnerFeedback,
  type PartnerFeedbackQuery,
} from "./partner.contracts";
import type { PartnerDb } from "./partner-shared-db.server";
import { readRecordedSessionsByGroup } from "./partner-shared-lookups.server";
import { PROGRAMME_TERMS_SLUG, toUtcIso } from "./partner-shared-values";

/**
 * `/feedback` — what one child answered on the way out of one session, paged
 * by the row's own key: `(participant_id, group_id, session_opens_at)`.
 */

/**
 * The embeds that scope a `session_feedback` select, without an id list in the
 * URL: an inner join through the row's group to its product and on to that
 * product's requirement of the Programme's terms, and an inner join to the
 * participant's profile so only a gamer's rows come back (D8). Every `!inner`
 * is load-bearing — without one, its filter narrows only an embedded value and
 * every row still comes back. The group's `product_id` and the product's
 * `timezone` ride along: the record's `product_id`, the column the `product_id`
 * filter narrows, and the zone a row's session day is read in.
 */
const FEEDBACK_SCOPE_EMBED =
  "group:product_groups!inner(product_id, product:products!inner(timezone, programme_terms:product_required_consents!inner(document_slug))), participant:profiles!inner(role)";
const FEEDBACK_SCOPE_FILTER = "group.product.programme_terms.document_slug";
const FEEDBACK_PARTICIPANT_FILTER = "participant.role";

const FEEDBACK_COLUMNS = `participant_id, group_id, session_opens_at, answers, note, exit_reason, ${FEEDBACK_SCOPE_EMBED}`;

/**
 * The key, in the order the fetch sorts by. Both uuids compare as their
 * lowercase hex, and `session_opens_at` as PostgREST emits it (`+00:00`,
 * trailing fractional zeros trimmed) compares digit by digit in the same order
 * as the instants — see `PartnerKey`. The value goes back into the filter
 * exactly as the database sent it, never re-serialised, so the cursor and the
 * column cannot disagree on precision.
 */
const KEY_COLUMNS = ["participant_id", "group_id", "session_opens_at"] as const;
type FeedbackKey = readonly [string, string, string];
const feedbackKey = z.tuple([z.string().uuid(), z.string().uuid(), z.string().min(1)]);

/** The stored shape; the table's CHECK already guarantees it. */
const storedAnswers = z.record(z.string(), z.number().int().min(1).max(5));

function isExitReason(value: string): value is PartnerExitReason {
  return (EXIT_REASON as readonly string[]).includes(value);
}

/**
 * The calendar day, in its product's timezone, of the session a feedback row
 * belongs to (D7). The row carries the instant the voice window OPENED, which is
 * `SESSION_WINDOW_BEFORE_MINUTES` before the session starts; `session_date` is
 * the day of the start, so the day is read from the start, not from the
 * opening — a session starting at 00:02 opened the evening before.
 */
export function feedbackSessionDate(sessionOpensAt: string, timezone: string): string {
  const startsAt =
    Date.parse(sessionOpensAt) + VOICE_CONFIG.SESSION_WINDOW_BEFORE_MINUTES * 60_000;
  return productLocalDate(new Date(startsAt), timezone);
}

/**
 * A row a child left with nothing on it (D8): no statement rated and no note.
 * An emptied form is stored rather than deleted, and the published page
 * promises such a child "leaves no row".
 */
export function isEmptyFeedback(answers: Record<string, number>, note: string): boolean {
  return Object.keys(answers).length === 0 && note.trim() === "";
}

const DAY_MS = 86_400_000;

/**
 * How far outside `[from, to]` (as UTC days) a row's opening instant may fall
 * and still have its product-local session day inside the range: a zone is at
 * most fourteen hours from UTC and the window opens minutes before the start,
 * so two days is a bound with room to spare. The database narrows by it; the
 * build applies the exact day.
 */
const RANGE_SLACK_MS = 2 * DAY_MS;

function dayStartMs(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

/**
 * One page of Programme session feedback, ascending by
 * `(participant_id, group_id, session_opens_at)`.
 *
 * The scope (Programme products, gamers only), `product_id`, `group_id` and
 * `participant_id` are database filters, as is a range on the opening instant
 * wide enough to hold every row whose session day could be in `from`/`to`.
 * **Two conditions are decided in the build instead**, because PostgREST
 * cannot state them: the exact session day, which needs each row's product
 * timezone, and the empty row, which needs a trimmed note. The keyset stays
 * exact because the cursor is a position in the one order, kept or dropped.
 *
 * `session_id` is the group's recorded session (D6) on the row's session day —
 * the same session `/sessions` serves — and `null` when that group has no
 * recorded session on that day, including one that exists only as a staff note
 * or a photograph.
 */
export async function readPartnerFeedback(
  db: PartnerDb,
  query: PartnerFeedbackQuery,
): Promise<{ data: PartnerFeedback[]; next_cursor: string | null }> {
  const keyOf = (row: {
    participant_id: string;
    group_id: string;
    session_opens_at: string;
  }): FeedbackKey => [row.participant_id, row.group_id, row.session_opens_at];

  return readPartnerPage({
    resource: "feedback",
    query,
    key: feedbackKey,
    keyOf,
    fetch: (after, take) => {
      let select = db
        .from("session_feedback")
        .select(FEEDBACK_COLUMNS, { count: "exact" })
        .eq(FEEDBACK_SCOPE_FILTER, PROGRAMME_TERMS_SLUG)
        .eq(FEEDBACK_PARTICIPANT_FILTER, "gamer");
      if (query.product_id !== undefined) {
        select = select.eq("group.product_id", query.product_id);
      }
      if (query.group_id !== undefined) select = select.eq("group_id", query.group_id);
      if (query.participant_id !== undefined) {
        select = select.eq("participant_id", query.participant_id);
      }
      if (query.from !== undefined) {
        select = select.gte(
          "session_opens_at",
          new Date(dayStartMs(query.from) - RANGE_SLACK_MS).toISOString(),
        );
      }
      if (query.to !== undefined) {
        select = select.lt(
          "session_opens_at",
          new Date(dayStartMs(query.to) + DAY_MS + RANGE_SLACK_MS).toISOString(),
        );
      }
      if (after !== null) select = select.or(keysetAfter(KEY_COLUMNS, after));
      return select
        .order("participant_id")
        .order("group_id")
        .order("session_opens_at")
        .limit(take);
    },
    build: async (rows) => {
      const candidates = rows.map((row) => {
        const answers = storedAnswers.parse(row.answers);
        const sessionDate = feedbackSessionDate(
          row.session_opens_at,
          row.group.product.timezone,
        );
        const kept =
          !isEmptyFeedback(answers, row.note) &&
          (query.from === undefined || sessionDate >= query.from) &&
          (query.to === undefined || sessionDate <= query.to);
        return { row, answers, sessionDate, kept };
      });

      const sessions = await readRecordedSessionsByGroup(
        db,
        candidates.filter((c) => c.kept).map((c) => c.row.group_id),
      );
      const sessionIdByDay = new Map<string, string>();
      for (const [groupId, list] of sessions) {
        for (const session of list) {
          sessionIdByDay.set(`${groupId}|${session.session_date}`, session.id);
        }
      }

      return candidates.map(({ row, answers, sessionDate, kept }): PartnerFeedback | null => {
        if (!kept) return null;
        // The column is NOT NULL and its CHECK admits exactly these two;
        // narrowed, not filtered.
        if (!isExitReason(row.exit_reason)) {
          throw new Error(
            `partner feedback: a row of group ${row.group_id} carries exit_reason ${row.exit_reason}`,
          );
        }
        return {
          participant_id: row.participant_id,
          group_id: row.group_id,
          product_id: row.group.product_id,
          session_id: sessionIdByDay.get(`${row.group_id}|${sessionDate}`) ?? null,
          session_opened_at: toUtcIso(row.session_opens_at),
          answers,
          note: row.note,
          exit_reason: row.exit_reason,
        };
      });
    },
  });
}
