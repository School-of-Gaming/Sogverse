import { getNextSessionStart } from "@/lib/enrollment";
import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  endDateToCutoff,
  getCurrentInProgressOccurrence,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import type { MyAssignedProductSessionRow } from "@/services/assignments";

/**
 * Per-assignment cap when a product has no `end_date`. Open-ended clubs run
 * indefinitely, so we surface a finite horizon of the next N occurrences
 * (across all of the product's weekly slots) rather than an unbounded list.
 * Mirrors `expandUpcomingSessions`'s `OPEN_ENDED_OCCURRENCE_CAP` so the
 * gedu's view of a club shows the same horizon as the parent/gamer's.
 */
const OPEN_ENDED_OCCURRENCE_CAP = 8;

/**
 * One emitted card for the gedu dashboard's Sessions section. The shape
 * matches what the prominent + compact cards both need: the prominent
 * card uses all fields; the compact card ignores `voiceIsOpen`,
 * `voiceHref`, `groupCount`, and `gamerCount` and keeps the rest.
 *
 * Mirrors `NextSessionCardProps` on the parent/gamer side, minus the
 * gamer attribution + reports link. The product-wide group/gamer counts
 * are gedu-specific — parents/gamers see the same product as their
 * own seat in it, but the gedu's mental model is "the whole room I run."
 */
export interface GroupSessionItem {
  /** Stable key for the (assignment, occurrence) pair — productId + sessionStart. */
  productId: string;
  /** The gedu's assigned group_id for this product. Drives the open-group link. */
  groupId: string;
  /** Translated product name. */
  productName: string;
  /** Total groups in the product (every group, not just the gedu's). */
  groupCount: number;
  /** Active participations across every group in the product. */
  gamerCount: number;
  /** When this occurrence starts (UTC instant, product-local wall time honored). */
  sessionStart: Date;
  /** When this occurrence ends — drives the start-end range label. */
  sessionEnd: Date;
  /**
   * Whether the voice room is currently joinable for this occurrence.
   * Computed only for the soonest item in the list (the only one a
   * prominent card renders); the compact card ignores this field.
   */
  voiceIsOpen: boolean;
  /** Where the Join button navigates. `"#"` keeps the button inert. */
  voiceHref: string;
  /** Where a click anywhere else on the card navigates. `"#"` for now. */
  openGroupHref: string;
}

/**
 * Adapter for the gedu dashboard's Sessions section.
 *
 * Walks every assignment row and emits one card per (assignment, slot,
 * future occurrence), sorted ascending by `sessionStart`. Open-ended
 * products are capped at the next 8 occurrences across all of their
 * slots; end-dated products emit every occurrence up to and including
 * `end_date`. Matches the parent/gamer expansion (`expandUpcomingSessions`)
 * so the gedu's view of a club shows the same horizon as the parent's.
 *
 * Sessions whose voice window has already closed
 * (`end + SESSION_WINDOW_AFTER` < now) are dropped so finished sessions
 * don't linger; in-progress sessions stay because their start is the
 * soonest meaningful moment for the card. `voiceIsOpen` is populated
 * only for the first emitted entry — the prominent card is the only
 * one that reads it.
 *
 * `voiceHref` is `"#"` for now even on remote products — the gedu
 * voice room page (`/gedu/voice/[id]`) was removed when the dashboard
 * was collapsed; it'll come back when we wire the Join button.
 * `openGroupHref` is also `"#"` until the per-group detail page lands.
 * See `TODO.md` for the matched notes.
 */
export function expandAssignedSessionsToCards(
  rows: MyAssignedProductSessionRow[],
  now: Date,
  locale: SupportedLocale,
): GroupSessionItem[] {
  const { SESSION_WINDOW_BEFORE_MINUTES, SESSION_WINDOW_AFTER_MINUTES } = VOICE_CONFIG;
  const beforeMs = SESSION_WINDOW_BEFORE_MINUTES * 60_000;
  const windowCloseMs = SESSION_WINDOW_AFTER_MINUTES * 60_000;

  const items: GroupSessionItem[] = [];

  for (const row of rows) {
    if (row.slots.length === 0) continue;

    const productName =
      resolveTranslation(row.product.translations, locale)?.name ?? "";

    const startBoundary = startDateToCutoff(
      row.product.startDate,
      row.product.timezone,
    );
    const endBoundary = endDateToCutoff(row.product.endDate, row.product.timezone);
    const cap = row.product.endDate === null ? OPEN_ENDED_OCCURRENCE_CAP : Infinity;

    const occurrences = enumerateOccurrences({
      slots: row.slots,
      timezone: row.product.timezone,
      now,
      startBoundary,
      endBoundary,
      cap,
      windowCloseMs,
    });

    for (const occ of occurrences) {
      items.push({
        productId: row.product.id,
        groupId: row.groupId,
        productName,
        groupCount: row.groupCount,
        gamerCount: row.gamerCount,
        sessionStart: occ.start,
        sessionEnd: occ.end,
        // Filled in for the soonest item below.
        voiceIsOpen: false,
        // Stub until /gedu/voice/[id] comes back. Same inert-link
        // treatment the gamer card gives in-person products.
        voiceHref: "#",
        // Per-group detail page is out of scope for now.
        openGroupHref: "#",
      });
    }
  }

  items.sort((a, b) => a.sessionStart.getTime() - b.sessionStart.getTime());

  if (items.length > 0) {
    const first = items[0];
    const opensAt = first.sessionStart.getTime() - beforeMs;
    const closesAt = first.sessionEnd.getTime() + windowCloseMs;
    const nowMs = now.getTime();
    first.voiceIsOpen = nowMs >= opensAt && nowMs < closesAt;
  }

  return items;
}

/**
 * Walk every slot forward in time, emitting concrete (start, end) pairs
 * in UTC. Per-slot iteration stops at the end-of-product-day boundary
 * (when end-dated) or after the cap is reached (when open-ended); the
 * merge sorts and trims to the cap one more time so the soonest N across
 * all slots win. Mirrors the helper in `upcoming-sessions.ts`.
 */
function enumerateOccurrences(args: {
  slots: MyAssignedProductSessionRow["slots"];
  timezone: string;
  now: Date;
  startBoundary: Date | null;
  endBoundary: Date | null;
  cap: number;
  windowCloseMs: number;
}): Array<{ start: Date; end: Date }> {
  const { slots, timezone, now, startBoundary, endBoundary, cap, windowCloseMs } =
    args;
  const out: Array<{ start: Date; end: Date }> = [];
  const perSlotCap = Number.isFinite(cap) ? cap : Number.POSITIVE_INFINITY;

  // If the product hasn't started yet (start_date is in the future), pin
  // the future-iteration cursor to "just before start_date" so the
  // search lands on or after start_date. Mirror of the parent's logic.
  const futureCursorBase =
    startBoundary !== null && startBoundary.getTime() > now.getTime()
      ? new Date(startBoundary.getTime() - 1)
      : now;

  for (const slot of slots) {
    const schedule = {
      dayOfWeek: slot.weekday,
      startTime: slot.startTime,
      timezone,
    };
    const durationMs = slot.durationMinutes * 60_000;

    let emitted = 0;

    const inProgress = getCurrentInProgressOccurrence({
      slot,
      timezone,
      now,
      startBoundary,
      endBoundary,
      windowCloseMs,
    });
    if (inProgress) {
      out.push(inProgress);
      emitted += 1;
    }

    let cursor = futureCursorBase;
    while (emitted < perSlotCap) {
      const start = getNextSessionStart(schedule, { now: cursor });
      if (endBoundary !== null && start.getTime() > endBoundary.getTime()) break;
      const end = new Date(start.getTime() + durationMs);
      out.push({ start, end });
      cursor = new Date(start.getTime() + 60_000);
      emitted += 1;
    }
  }

  out.sort((a, b) => a.start.getTime() - b.start.getTime());
  return Number.isFinite(cap) ? out.slice(0, cap) : out;
}
