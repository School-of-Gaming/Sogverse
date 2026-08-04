import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  formatProductSchedule,
  scheduleCardLines,
} from "@/components/public/products/format-product-schedule";
import type { SupportedLocale } from "@/lib/constants/locales";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import {
  endDateToCutoff,
  enumerateRowOccurrences,
  startDateToCutoff,
} from "@/lib/session-occurrence";
import type { ProductType } from "@/types";
import type { FamilyEnrollmentSummary } from "./enrollment-rollup";

/**
 * The shared half of the family dashboards' fixtures: turning a short
 * description of an enrollment ("a remote club, running right now, with a
 * failing card") into the summary both page bodies consume.
 *
 * **Nothing here is hand-written narrative.** The next session comes out of the
 * same occurrence walk the live dashboards use, including the case where one is
 * in progress; the schedule sentence comes out of the same product-schedule
 * formatter the public browse cards use. So a preview shows the real
 * derivations — a Join that opens when the window really opens, a cadence line
 * in the viewer's own zone — rather than a plausible imitation of them.
 *
 * Everything is computed from a `now` the caller supplies, so a scene can hold
 * one instant and get a deterministic page out of it. What is authored is only
 * what a schedule cannot derive: the names, the venues, and which enrollment is
 * carrying which exceptional state.
 */

/**
 * The zone the fixture products are authored in — the one every real Sogverse
 * product uses. Deliberately not the viewer's: a schedule slot is a weekday plus
 * a clock face *there*, and deriving one from the viewer's zone would put a
 * session on the wrong day either side of midnight.
 */
export const FIXTURE_TIMEZONE = "Europe/Helsinki";

export interface FixtureSlot {
  /** 0 = Monday. */
  weekday: number;
  /** `"HH:MM"` in `FIXTURE_TIMEZONE`. */
  startTime: string;
  durationMinutes: number;
}

/** The instant, locale and zone a whole page of fixtures is derived from. */
export interface FixtureClock {
  now: Date;
  locale: SupportedLocale;
  /** Viewer's IANA zone — every time on the page renders in it. */
  timeZone: string;
}

export interface EnrollmentFixtureSpec {
  /** Stable key; also what a payment badge would route a portal session by. */
  participationId: string;
  productName: string;
  productType: ProductType;
  /** Remote products have a voice room and no venue; in-person the reverse. */
  isRemote: boolean;
  slots: FixtureSlot[];
  startedDaysAgo: number;
  /**
   * Days after `now` the run ends, or `null` for an open-ended club. Negative
   * puts the last day in the past, which is what makes a card a finished one.
   */
  endsInDays: number | null;
  /** The venue, on in-person products. A remote product has no building. */
  siteName?: string | null;
  /** 1-based place in line, when this enrollment is a waitlist place. */
  waitlistPosition?: number | null;
  /** The subscription behind this enrollment is `past_due`. */
  paymentProblem?: boolean;
  /**
   * Days from `now` that paid access runs out, when the parent has cancelled.
   * `null`/omitted for a healthy subscription and for everything that isn't one.
   */
  cancelledAccessInDays?: number | null;
}

export function buildEnrollmentFixture(
  { now, locale, timeZone }: FixtureClock,
  spec: EnrollmentFixtureSpec,
): FamilyEnrollmentSummary {
  const startDate = calendarDate(now, -spec.startedDaysAgo);
  const endDate =
    spec.endsInDays === null ? null : calendarDate(now, spec.endsInDays);
  const waitlistPosition = spec.waitlistPosition ?? null;

  // A waitlisted family holds no seat, so no occurrence of this product is
  // theirs to turn up to — the schedule still renders (it is a fact about the
  // product), but the next session does not.
  const next =
    waitlistPosition !== null
      ? null
      : nextOccurrence({ now, slots: spec.slots, startDate, endDate });

  const scheduleLines = scheduleCardLines(
    formatProductSchedule({
      product: {
        product_type: spec.productType,
        start_date: startDate,
        end_date: endDate,
        timezone: FIXTURE_TIMEZONE,
        schedule_slots: spec.slots.map((slot) => ({
          weekday: slot.weekday,
          start_time: slot.startTime,
          duration_minutes: slot.durationMinutes,
        })),
      },
      locale,
      timeZone,
      now,
    }),
  );

  const cancelledAccessInDays = spec.cancelledAccessInDays ?? null;

  return {
    participationId: spec.participationId,
    productName: spec.productName,
    productType: spec.productType,
    nextSessionStart: next?.start ?? null,
    nextSessionEnd: next?.end ?? null,
    hasVoiceRoom: spec.isRemote,
    // Left inert on purpose: a preview has no room to join, so the Join button
    // collapses to its inert form while still rendering its real open/locked
    // state.
    voiceHref: "#",
    // Never carried by a remote product, whatever the spec says: a product with
    // a voice room has no building, and a card showing both would be claiming
    // the family meets in two places.
    siteName: spec.isRemote ? null : (spec.siteName ?? null),
    // The product page a family opens from a card does not exist yet, so every
    // card is a real link that goes nowhere rather than a div pretending to be
    // one — the semantics are what this mock is for.
    openHref: "#",
    endDate,
    timezone: FIXTURE_TIMEZONE,
    waitlistPosition,
    paymentProblem: spec.paymentProblem ?? false,
    cancellation:
      cancelledAccessInDays === null
        ? null
        : {
            accessUntil: new Date(
              now.getTime() + cancelledAccessInDays * 86_400_000,
            ),
            // The badge names the participation's final session; on a run with
            // several left, this card is not it.
            lastSessionStart: next?.start ?? now,
            isLastSession: false,
          },
    scheduleLines,
  };
}

/**
 * The soonest occurrence still worth showing, capped at one — the same walk the
 * roll-up behind the live dashboards does, including an in-progress session,
 * which is precisely when the Join button matters.
 */
function nextOccurrence({
  now,
  slots,
  startDate,
  endDate,
}: {
  now: Date;
  slots: FixtureSlot[];
  startDate: string;
  endDate: string | null;
}): { start: Date; end: Date } | null {
  if (slots.length === 0) return null;
  const occurrences = enumerateRowOccurrences({
    slots,
    timezone: FIXTURE_TIMEZONE,
    now,
    startBoundary: startDateToCutoff(startDate, FIXTURE_TIMEZONE),
    endBoundary: endDateToCutoff(endDate, FIXTURE_TIMEZONE),
    cap: 1,
    windowCloseMs: VOICE_CONFIG.SESSION_WINDOW_AFTER_MINUTES * 60_000,
  });
  return occurrences[0] ?? null;
}

/**
 * A weekly slot whose current occurrence started a few minutes ago, so the
 * enrollment is mid-session the moment the scene is opened.
 *
 * The open Join is the one state on these cards that cannot be seen on demand —
 * it is true for a couple of hours a week — so the card that owns the room is
 * always live when somebody looks. Its cadence line then reads as whatever
 * weekday you happen to open the page on, which is the honest consequence and
 * costs less than a Join button nobody can ever see lit.
 *
 * The wall clock is read **in the product's own zone** and floored to a quarter
 * hour: flooring only ever moves the start earlier, so the session stays in
 * progress, and it keeps the cadence reading like a real schedule
 * ("16:30–18:00") rather than an arbitrary minute.
 */
export function liveNowSlot(now: Date, durationMinutes: number): FixtureSlot {
  const started = toZonedTime(new Date(now.getTime() - 25 * 60_000), FIXTURE_TIMEZONE);
  started.setMinutes(Math.floor(started.getMinutes() / 15) * 15, 0, 0);
  return {
    // `getDay()` is 0 = Sunday; schedule slots are 0 = Monday.
    weekday: (started.getDay() + 6) % 7,
    startTime: `${pad2(started.getHours())}:${pad2(started.getMinutes())}`,
    durationMinutes,
  };
}

/**
 * A weekly slot a few days out, at a fixed clock face — the ordinary case, where
 * the next session is a date to read rather than a room to walk into. The
 * weekday is derived in the product's zone, for the same reason the live slot's
 * is.
 *
 * Deriving the weekday from `now` rather than pinning it is what keeps the
 * locked Join deterministic: a pinned Monday would be mid-session on a Monday
 * evening, so the card meant to show the *closed* state would occasionally show
 * the open one instead. The cost is that the cadence line reads as whatever day
 * you happen to open the scene on — which is why **no fixture product is named
 * after a weekday**. "Minecraft Monday Club" saying "Saturday · 17:00" is the
 * fixture contradicting itself on screen, and the cheap fix is the name.
 */
export function futureSlot(
  now: Date,
  daysAhead: number,
  startTime: string,
  durationMinutes: number,
): FixtureSlot {
  const target = toZonedTime(now, FIXTURE_TIMEZONE);
  target.setDate(target.getDate() + daysAhead);
  return {
    weekday: (target.getDay() + 6) % 7,
    startTime,
    durationMinutes,
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * A bare `YYYY-MM-DD` offset from today, **as today falls in the product's own
 * zone**.
 *
 * A product's start and end dates are zoneless calendar dates read back as
 * boundaries on a schedule authored in the product's timezone, so "today" here
 * has to mean today *there*. Stepping and formatting in UTC instead puts the
 * whole run a day early for every evening between about 21:00 UTC and Helsinki
 * midnight — which is exactly when a fixture's live session would find its own
 * end date already behind it and quietly stop being live.
 */
export function calendarDate(now: Date, dayOffset: number): string {
  const zoned = toZonedTime(now, FIXTURE_TIMEZONE);
  zoned.setDate(zoned.getDate() + dayOffset);
  return formatInTimeZone(
    fromZonedTime(zoned, FIXTURE_TIMEZONE),
    FIXTURE_TIMEZONE,
    "yyyy-MM-dd",
  );
}
