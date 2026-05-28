import { ROUTES } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  endDateToCutoff,
  enumerateRowOccurrences,
  OPEN_ENDED_OCCURRENCE_CAP,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import type { MyAssignedProductSessionRow } from "@/services/assignments";

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
  /** Where a click anywhere on the card navigates — the gedu's session-details page. */
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
 * `voiceHref` points at the shared `/voice/group/[id]` page, which
 * routes the gedu through the same `VoiceSessionPage` the gamer side
 * uses. Moderator rights come from the token endpoint (any non-gamer
 * role gets `isOwner: true`); cross-group access for sister groups is
 * authorized there too via `gedu_group_assignments_v2.product_id`.
 * In-person products and unassigned rows collapse to `"#"` for the
 * same locked-but-inert UX the gamer side renders.
 * `openGroupHref` points at the gedu's session-details page; the URL
 * prefix is picked from the product's type so the gedu lands on a
 * route that matches their mental model (clubs / camps / events).
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
    // Mirror upcoming-sessions: only remote products have a voice room,
    // and the gedu always has a concrete group_id on every row (assignment
    // rows are keyed by group), so `row.groupId` is non-null here. The
    // remote check is the meaningful gate.
    const voiceHref = row.product.isRemote
      ? ROUTES.voice.groupSession(row.groupId)
      : "#";

    const startBoundary = startDateToCutoff(
      row.product.startDate,
      row.product.timezone,
    );
    const endBoundary = endDateToCutoff(row.product.endDate, row.product.timezone);
    const cap = row.product.endDate === null ? OPEN_ENDED_OCCURRENCE_CAP : Infinity;

    const occurrences = enumerateRowOccurrences({
      slots: row.slots,
      timezone: row.product.timezone,
      now,
      startBoundary,
      endBoundary,
      cap,
      windowCloseMs,
    });

    const openGroupHref = ROUTES.gedu.assignedProduct(
      row.product.productType,
      row.product.id,
    );

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
        voiceHref,
        openGroupHref,
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
