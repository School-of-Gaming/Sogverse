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
import { isVoiceWindowOpen } from "@/lib/voice-window";
import type { NextSessionCardProps } from "@/components/parent/NextSessionCard";
import type { MyUpcomingSessionRow } from "@/services/participations";

/**
 * The earlier of two optional UTC cutoffs (the product's end date and a
 * cancelled subscription's paid-through instant). `null` means "no bound on
 * this side", so the other wins; both null means unbounded.
 */
function earlierBoundary(a: Date | null, b: Date | null): Date | null {
  if (a === null) return b;
  if (b === null) return a;
  return a.getTime() <= b.getTime() ? a : b;
}

/**
 * One expanded occurrence card. `isNext` distinguishes the soonest occurrence
 * of each (gamer × product) pairing — rendered as the prominent
 * `NextSessionCard` (live/locked Join button + Padlet/reports link) — from
 * every later occurrence of the same pairing, which renders as a compact,
 * info-only `UpcomingSessionCard`. Surfacing one prominent card *per pairing*
 * (rather than only the single globally-soonest session) is what keeps the
 * Join button + Padlet link reachable for every gamer in a multi-gamer family.
 */
export interface UpcomingSessionEntry extends NextSessionCardProps {
  isNext: boolean;
}

/**
 * Expand the viewer's active participations into a flat, time-sorted list of
 * concrete upcoming sessions for the dashboard Sessions section (drives both
 * `/parent` and `/gamer`). Includes not-yet-placed (unassigned)
 * participations — those expand to the same occurrence cards, flagged
 * `awaiting` so the card renders a disabled Join button + "matching with a
 * Gedu" copy instead of a live/locked CTA.
 *
 * One emitted entry per (participation, slot, future occurrence). Sessions
 * whose voice window has already closed (`end + SESSION_WINDOW_AFTER` < now)
 * are dropped so finished sessions don't linger — but in-progress sessions
 * stay because their start is still the soonest meaningful moment for the
 * card to reference. Sort is ascending by `sessionStart`, so an in-progress
 * session ends up at the top exactly as a "starts in 5 min" one would.
 *
 * `voiceIsOpen` is populated only for the `isNext` entries (the first
 * occurrence of each gamer × product): `NextSessionCard` is the only card
 * that consumes it (`UpcomingSessionCard` is info-only), so computing windows
 * for every entry would be wasted work.
 */
export function expandUpcomingSessions(
  rows: MyUpcomingSessionRow[],
  now: Date,
  locale: SupportedLocale,
): UpcomingSessionEntry[] {
  const windowCloseMs = VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000;

  const sessions: UpcomingSessionEntry[] = [];

  for (const row of rows) {
    if (row.slots.length === 0) continue;

    const productName =
      resolveTranslation(row.product.translations, locale)?.name ?? "";
    // Per the task brief: Padlet link is the reports button even when the
    // product has no Padlet URL set. The button still renders; clicking is
    // a no-op via `#`. A null-Padlet product is the unexpected case in
    // practice — surfacing the button keeps the card layout stable rather
    // than reflowing for an edge case.
    const reportsHref = row.product.padletUrl ?? "#";
    // `group_id IS NULL` means the gamer is purchased-but-not-yet-placed.
    // The schedule still comes off the product, so we emit the full set of
    // occurrence cards exactly as for an assigned gamer — only the action
    // zone differs: `awaiting` keeps the Join button disabled (no room to
    // join until an admin places them with a Gedu) and surfaces the
    // friendly "matching with a Gedu" copy. See NextSessionCard /
    // UpcomingSessionCard.
    const awaiting = row.groupId === null;
    // The voice room route is keyed by `product_groups.id` (UUID) and
    // only exists for remote products. Unassigned participations and
    // in-person products both collapse to a `"#"` no-op — the button stays
    // inert either way.
    const voiceHref =
      row.product.isRemote && row.groupId
        ? ROUTES.voice.groupSession(row.groupId)
        : "#";
    const startBoundary = startDateToCutoff(
      row.product.startDate,
      row.product.timezone,
    );
    const productEnd = endDateToCutoff(row.product.endDate, row.product.timezone);
    // A cancelled club subscription caps the list at the paid-through instant
    // (`current_period_end`). Clamp to whichever terminates first — the
    // product's own end date or the subscription end — so a canceling sub
    // hides sessions the family no longer has access to. `subscriptionEndsAt`
    // is an exact UTC instant; it slots straight in alongside the product's
    // end-of-day cutoff. Only set when the sub is `canceling`, so an active
    // (monthly-renewing) sub never clamps. Applies to both audiences.
    const subEnd = row.subscriptionEndsAt;
    const endBoundary = earlierBoundary(productEnd, subEnd);
    // Open-ended clubs normally cap at the next N occurrences. A canceling sub
    // gives a real terminal date, so — like an end-dated product — emit every
    // remaining paid session up to it rather than an arbitrary N, letting the
    // parent see exactly what they still have until access ends.
    const cap =
      row.product.endDate === null && subEnd === null
        ? OPEN_ENDED_OCCURRENCE_CAP
        : Infinity;

    const occurrences = enumerateRowOccurrences({
      slots: row.slots,
      timezone: row.product.timezone,
      now,
      startBoundary,
      endBoundary,
      cap,
      windowCloseMs,
    });

    // The participation's final remaining occurrence (occurrences are sorted
    // ascending within the row). For a canceling sub this is the gamer's last
    // session before access ends — every card of the participation references
    // it (tooltip), and the card that *is* it shows the "Last session" badge.
    const lastIndex = occurrences.length - 1;
    const lastOccurrence = occurrences[lastIndex];

    occurrences.forEach((occ, index) => {
      // The first occurrence of this row is the soonest occurrence of this
      // (gamer × product) pairing, so it's the one promoted to the prominent
      // `NextSessionCard`. Per-row `index === 0` is exactly that "first per
      // pairing": the dashboard query filters `status = 'active'`, and the
      // partial unique index `uq_participations_active_or_waitlisted`
      // (product_id, gamer_id) guarantees one active row per pairing — so each
      // row IS a distinct pairing, and its occurrences are sorted ascending.
      // If either the status filter or that index changes, revisit this.
      const isNext = index === 0;
      sessions.push({
        gamerFirstName: row.gamer.firstName,
        gamerSeed: row.gamer.id,
        productName,
        sessionStart: occ.start,
        sessionEnd: occ.end,
        // `voiceIsOpen` tracks the *window*, not join-ability: an awaiting
        // gamer's session still goes live on schedule (the card keeps its live
        // styling + "in progress"), they just can't join until placement — the
        // Join button gates that on `awaiting`. Only `NextSessionCard`
        // (isNext) consumes it, so it's left false for the compact cards. See
        // NextSessionCard / JoinVoiceButton.
        voiceIsOpen: isNext
          ? isVoiceWindowOpen(occ.start, occ.end, now)
          : false,
        isNext,
        voiceHref,
        reportsHref,
        awaiting,
        // Per-participation: every occurrence of a past_due club's sub carries
        // the flag, so the badge shows on all of that club's cards.
        paymentProblem: row.paymentProblem,
        // Set only for canceling subs (subEnd != null), else null. Drives the
        // parent-only "Won't renew" / "Last session" badge; gamer cards just
        // show fewer occurrences (clamped above) with no badge. accessUntil +
        // lastSessionStart are constant across the participation's cards;
        // isLastSession marks the final occurrence.
        cancellation: subEnd
          ? {
              accessUntil: subEnd,
              lastSessionStart: lastOccurrence.start,
              isLastSession: index === lastIndex,
            }
          : null,
      });
    });
  }

  sessions.sort(
    (a, b) => a.sessionStart.getTime() - b.sessionStart.getTime(),
  );

  return sessions;
}
