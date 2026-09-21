import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { occurrenceOnDate } from "@/lib/session-date-occurrence";
import {
  earlierBoundary,
  endDateToCutoff,
  enumerateRowOccurrences,
  productLocalDate,
  sessionEntryId,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import type { GeduAssignmentRow } from "@/lib/gedu-assignment-rollup";
import type { ProductType } from "@/types";

/**
 * **The sessions a gedu is expected at and could file an absence for**, built
 * from the seats they already hold.
 *
 * The Substitutions page offers a second way into "I can't make this session" —
 * a picker, for a gedu who knows the date they cannot make and does not want to
 * go and find its card — and this is the list that picker is over. It is the
 * *same* schedule expansion every other surface uses (`session-occurrence`),
 * handed the *same* assignment rows the dashboard's roll-up consumes, so the
 * picker cannot offer a session the group's own feed does not have: the client
 * owns the calendar math here as it does everywhere, and a second expansion is
 * exactly what this module exists not to be.
 *
 * Pure, and the clock enters as an argument.
 */

/** One session the viewer holds a seat at, in the shape a picker row renders. */
export interface GeduUpcomingSession {
  /**
   * `${group}:${date}` — the session's own identity everywhere in the app, and
   * the key the write is made on.
   */
  key: string;
  groupId: string;
  /** Product-local `YYYY-MM-DD`, which is what the write is keyed by. */
  sessionDate: string;
  /** When it runs. Never null: a session with no instant is not offered. */
  startsAt: Date;
  endsAt: Date;
  /** The product's own zone, which `sessionDate` is a date in. */
  timezone: string;
  productId: string;
  /** Translated, in the viewer's locale, exactly as a card resolves one. */
  productName: string;
  productType: ProductType;
  /** The viewer's group on this product, or `null` while it is unknown. */
  groupName: string | null;
  isRemote: boolean;
  /** The building, on an in-person product; `null` on a remote one. */
  siteName: string | null;
}

/**
 * How far ahead the picker looks.
 *
 * **Sixty days, because that is the window the queue reads.**
 * `get_open_substitution_requests` returns open requests dated inside the next
 * sixty days, so an absence filed further out than that would sit in a queue
 * nobody can see it in until it drifted into range — a request nobody is told
 * about is the one thing this feature must not produce. The bound is therefore
 * a property of the pool rather than a taste about list length, and moving it
 * means moving the SQL window with it.
 */
export const GEDU_UPCOMING_SESSION_HORIZON_DAYS = 60;

/**
 * The viewer's own upcoming sessions, **soonest first**.
 *
 * Both kinds of seat are walked, because both are seats the viewer is expected
 * at and can file against: a standing **assignment** contributes every
 * occurrence its schedule projects inside the horizon, and a live
 * **substitution** contributes the one afternoon it covers. That is the same
 * pair the card's own condition admits — a sub asking for a sub is the case —
 * so the picker and the cards offer the same set.
 *
 * A session already finished is not in the list: the walk carries no window
 * past an occurrence's end (`windowCloseMs: 0`), which is the card's rule too —
 * the entry's kind flips at the session's end, and a finished card offers
 * nothing. A session **in progress** is still offered, on both surfaces, for
 * the same reason the write accepts it: the database's test is the date.
 *
 * One entry per (group, date). Two slots landing on one calendar day are one
 * session as far as Postgres is concerned — that pair is the row's unique key —
 * so the earlier instant wins and the later is dropped rather than offering two
 * rows whose write is the same write.
 */
export function buildGeduUpcomingSessions({
  rows,
  locale,
  now,
}: {
  rows: readonly GeduAssignmentRow[];
  locale: SupportedLocale;
  now: Date;
}): GeduUpcomingSession[] {
  const horizon = new Date(
    now.getTime() + GEDU_UPCOMING_SESSION_HORIZON_DAYS * 24 * 60 * 60 * 1000,
  );
  const bySession = new Map<string, GeduUpcomingSession>();

  for (const row of rows) {
    const timezone = row.product.timezone;
    const occurrences =
      row.kind === "substitution"
        ? substitutionOccurrence(row, now, horizon)
        : enumerateRowOccurrences({
            slots: row.slots,
            timezone,
            now,
            startBoundary: startDateToCutoff(row.product.startDate, timezone),
            // The product's own last day, or the horizon, whichever comes
            // first — and there is always one, which is what makes the
            // uncapped walk terminate.
            endBoundary: earlierBoundary(
              endDateToCutoff(row.product.endDate, timezone),
              horizon,
            ),
            cap: Number.POSITIVE_INFINITY,
            // No grace after the end: a session that has finished is not one
            // anybody can be absent from, and the card stops offering at the
            // same instant.
            windowCloseMs: 0,
          });

    for (const occurrence of occurrences) {
      const sessionDate = productLocalDate(occurrence.start, timezone);
      const key = sessionEntryId(row.groupId, sessionDate);
      const existing = bySession.get(key);
      if (
        existing !== undefined &&
        existing.startsAt.getTime() <= occurrence.start.getTime()
      ) {
        continue;
      }
      bySession.set(key, {
        key,
        groupId: row.groupId,
        sessionDate,
        startsAt: occurrence.start,
        endsAt: occurrence.end,
        timezone,
        productId: row.product.id,
        productName:
          resolveTranslation(row.product.translations, locale)?.name ?? "",
        productType: row.product.productType,
        groupName: row.groupName,
        isRemote: row.product.isRemote,
        // Never carried by a remote product, whatever the row says: a product
        // with a voice room has no building, and a row showing both would be
        // claiming the group meets in two places.
        siteName: row.product.isRemote ? null : row.siteName,
      });
    }
  }

  return [...bySession.values()].sort(bySoonest);
}

/**
 * The one afternoon a substitution seat covers, if it is still ahead and inside
 * the horizon — otherwise nothing.
 *
 * A date the schedule no longer projects resolves to no occurrence at all, and
 * such a seat is left out rather than offered dateless: the write is refused
 * for a session the schedule does not name, so a row for it could only ever
 * fail.
 */
function substitutionOccurrence(
  row: GeduAssignmentRow,
  now: Date,
  horizon: Date,
): Array<{ start: Date; end: Date }> {
  if (row.substitutionDate === null) return [];
  const occurrence = occurrenceOnDate({
    sessionDate: row.substitutionDate,
    slots: row.slots,
    timezone: row.product.timezone,
  });
  if (occurrence === null) return [];
  if (occurrence.end.getTime() <= now.getTime()) return [];
  if (occurrence.start.getTime() > horizon.getTime()) return [];
  return [occurrence];
}

/** Soonest first, then by product name, then by group — a total order. */
function bySoonest(a: GeduUpcomingSession, b: GeduUpcomingSession): number {
  const byStart = a.startsAt.getTime() - b.startsAt.getTime();
  if (byStart !== 0) return byStart;
  const byName = a.productName.localeCompare(b.productName);
  if (byName !== 0) return byName;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}
