import { ROUTES } from "@/lib/constants";
import { getNextSessionStart } from "@/lib/enrollment";
import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  endDateToCutoff,
  getCurrentInProgressOccurrence,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import type { GroupCardProps } from "@/components/gedu/GroupCard";
import type { MyAssignedProductSessionRow } from "@/services/assignments";

/**
 * Adapter for the gedu dashboard's "My Groups" section.
 *
 * Mirrors `expandUpcomingSessions` (parent/gamer) but emits one card per
 * assigned product instead of one card per occurrence — the gedu has at
 * most one group per product, so the natural unit is the product itself,
 * keyed off its soonest upcoming session.
 *
 * Drops assignments with no future occurrence (e.g. camps whose final
 * day has fully passed). This matches what parents/gamers see today and
 * is tracked as a known padlet/notes access gap in `TODO.md` — once that
 * gap is closed, this filter should change too.
 *
 * `voiceIsOpen` is computed per card (each product can be live
 * independently) using the same `SESSION_WINDOW_BEFORE/AFTER_MINUTES`
 * the rest of the app uses.
 *
 * `voiceHref` is `"#"` for now even on remote products — the gedu voice
 * room page (`/gedu/voice/[id]`) was removed when the dashboard was
 * collapsed; it'll come back when we wire the join button. Same inert-
 * link treatment the gamer side gives to in-person products today.
 * See `TODO.md` for the matched note.
 */
export function expandAssignedProductsToCards(
  rows: MyAssignedProductSessionRow[],
  now: Date,
  locale: SupportedLocale,
): GroupCardProps[] {
  const { SESSION_WINDOW_BEFORE_MINUTES, SESSION_WINDOW_AFTER_MINUTES } = VOICE_CONFIG;
  const beforeMs = SESSION_WINDOW_BEFORE_MINUTES * 60_000;
  const afterMs = SESSION_WINDOW_AFTER_MINUTES * 60_000;

  const cards: GroupCardProps[] = [];

  for (const row of rows) {
    if (row.slots.length === 0) continue;

    const productName =
      resolveTranslation(row.product.translations, locale)?.name ?? "";

    const startBoundary = startDateToCutoff(row.product.startDate, row.product.timezone);
    const endBoundary = endDateToCutoff(row.product.endDate, row.product.timezone);

    const occurrence = findNextOccurrence({
      slots: row.slots,
      timezone: row.product.timezone,
      now,
      startBoundary,
      endBoundary,
      windowCloseMs: afterMs,
    });
    if (!occurrence) continue;

    const opensAt = occurrence.start.getTime() - beforeMs;
    const closesAt = occurrence.end.getTime() + afterMs;
    const nowMs = now.getTime();
    const voiceIsOpen = nowMs >= opensAt && nowMs < closesAt;

    cards.push({
      productId: row.product.id,
      groupId: row.groupId,
      productName,
      groupCount: row.groupCount,
      gamerCount: row.gamerCount,
      sessionStart: occurrence.start,
      sessionEnd: occurrence.end,
      voiceIsOpen,
      // Stub until /gedu/voice/[id] comes back. Inert link, matching the
      // gamer card's treatment of in-person products.
      voiceHref: "#",
      // Whole-card destination — the per-group detail page is out of
      // scope for now, so the click is a no-op too.
      openGroupHref: "#",
    });
  }

  cards.sort((a, b) => a.sessionStart.getTime() - b.sessionStart.getTime());
  return cards;
}

/**
 * Find the soonest joinable occurrence across a product's slots.
 *
 * For each slot: prefer an in-progress occurrence if one exists (shared
 * helper handles the DST-safe prev-week-in-window check), otherwise
 * take the soonest future occurrence that falls within the product's
 * date bounds. Pick the earliest of the resulting candidates.
 */
function findNextOccurrence(args: {
  slots: MyAssignedProductSessionRow["slots"];
  timezone: string;
  now: Date;
  startBoundary: Date | null;
  endBoundary: Date | null;
  windowCloseMs: number;
}): { start: Date; end: Date } | null {
  const { slots, timezone, now, startBoundary, endBoundary, windowCloseMs } = args;

  // Same future-cursor pinning as `expandUpcomingSessions`: if the
  // product hasn't started yet, search from "just before start_date" so
  // we don't return phantom occurrences before the product opens.
  const futureCursorBase =
    startBoundary !== null && startBoundary.getTime() > now.getTime()
      ? new Date(startBoundary.getTime() - 1)
      : now;

  const candidates: Array<{ start: Date; end: Date }> = [];

  for (const slot of slots) {
    const inProgress = getCurrentInProgressOccurrence({
      slot,
      timezone,
      now,
      startBoundary,
      endBoundary,
      windowCloseMs,
    });
    if (inProgress) {
      candidates.push(inProgress);
      continue;
    }

    const schedule = {
      dayOfWeek: slot.weekday,
      startTime: slot.startTime,
      timezone,
    };
    const durationMs = slot.durationMinutes * 60_000;
    const start = getNextSessionStart(schedule, { now: futureCursorBase });
    if (endBoundary !== null && start.getTime() > endBoundary.getTime()) continue;
    const end = new Date(start.getTime() + durationMs);
    candidates.push({ start, end });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.start.getTime() - b.start.getTime());
  return candidates[0];
}

// Re-export for symmetry with `upcoming-sessions.ts` — consumers wiring
// the open-group destination later can swap `"#"` for the real route.
export const _openGroupHrefPlaceholder = ROUTES.gedu.dashboard;
