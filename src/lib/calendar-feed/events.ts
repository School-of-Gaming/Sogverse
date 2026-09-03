import { ROUTES } from "@/lib/constants";
import type { SupportedLocale } from "@/lib/constants/locales";
import {
  MAX_PAST_OCCURRENCES_PER_SLOT,
  earlierBoundary,
  endDateToCutoff,
  enumeratePastRowOccurrences,
  enumerateRowOccurrences,
  productLocalDate,
  startDateToCutoff,
  type SlotShape,
} from "@/lib/session-occurrence";
import { formatUtcTimestamp } from "./ics";
import {
  horizonWeeks,
  scopedParticipantId,
  type CalendarFeedOptions,
} from "./options";
import type { CalendarFeedTranslator } from "./translator";
import type { ProductType } from "@/types";

/**
 * Turning a family's seats into calendar events.
 *
 * **This module knows nothing about where a seat came from.** Two sources feed
 * it — a real customer's rows, read from the database, and an admin's sandbox
 * family, read from a JSON document — and each maps into `FeedSeat` before it
 * gets here. That is what makes the two paths one pipeline: the expansion, the
 * titles, the descriptions and the `.ics` writer are literally the same code,
 * so a sandbox cannot demonstrate behaviour a real feed does not have.
 *
 * **The expansion is holiday-blind, deliberately and as an inherited limit.**
 * It uses the shared walker in `src/lib/session-occurrence.ts`, which is the
 * same expansion the dashboards and both session feeds use and which ignores
 * holiday calendars outright. The investigation behind this work is explicit
 * that an outbound artifact — a mail, a calendar event — really wants the
 * holiday-aware expansion, and that unifying the three expansions is the first
 * brick of shipping one. This exploration does not lay that brick: it inherits
 * the blindness so that what it is testing is the *calendar* question (what do
 * Apple, Google and Outlook do with an alarm, a rule, a zone) rather than the
 * occurrence question. Nothing here emits `EXDATE`.
 */

/**
 * One seat the feed covers, in the neutral shape both sources map into.
 *
 * Everything locale-dependent is already resolved: the product's name and the
 * location's name are the strings a reader will see, chosen by whoever did the
 * mapping. A source that has no such choice to make (the sandbox stores one
 * name per product) simply passes what it has.
 */
export interface FeedSeat {
  /** The seat's own id — what a UID and a family page URL are keyed on. */
  participationId: string;
  /** The seat-holder, for the per-gamer scope filter. */
  participantId: string;
  gamerName: string;
  /**
   * Whether a group has been assigned. An unplaced seat has no family page to
   * link at, so it carries no `URL` even under `details=full`.
   */
  isPlaced: boolean;
  productType: ProductType;
  /** Already resolved for the reader's locale. */
  productName: string;
  /** The product's own zone — the zone a TZID-stated event is a wall clock in. */
  timezone: string;
  /** Bare `YYYY-MM-DD` run boundaries, or `null` for an open-ended run. */
  startDate: string | null;
  endDate: string | null;
  isRemote: boolean;
  /** Already localized; `null` when the product names no place. */
  locationName: string | null;
  spokenLanguageCode: string;
  slots: readonly SlotShape[];
  /**
   * The paid-through instant of a canceling subscription, or `null`. Nothing
   * after it is enumerated: a family whose subscription is winding down should
   * not see sessions their calendar says they are going to.
   */
  cancelsAt: Date | null;
}

/**
 * One computed session, in the neutral shape both serialisations consume — the
 * `.ics` document and the JSON the admin card renders as a table. One
 * computation, two renderings, so the table cannot show a session the feed
 * does not carry.
 */
export interface CalendarFeedEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description: string | null;
  location: string | null;
  url: string | null;
  /** The `RRULE` body, in rrule mode only; `null` for a discrete occurrence. */
  rrule: string | null;
  /** The product's own zone — the zone a TZID-stated event is a wall clock in. */
  timezone: string;
  // --- context the preview table shows, and the document does not ---
  gamerName: string;
  productName: string;
  productType: ProductType;
}

/** RFC 5545 `BYDAY` codes, indexed by the schema's 0=Monday weekday. */
const BYDAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

/**
 * A fixed one-week look-back, so the current week is complete in the client
 * rather than starting from whenever the poll happened to land.
 */
const LOOKBACK_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The en dash the brand uses between two names, spaced. */
const EN_DASH = "–";

interface FeedSlot extends SlotShape {
  /**
   * Which slot on its weekday this is, counting from zero in start-time order.
   *
   * Part of every UID this module writes, discrete and recurring alike, and
   * paired there with the weekday rather than with a position in the product's
   * whole slot list. Nearly every product has one slot per weekday, so this is
   * nearly always `0` — which means the UID survives the commonest schedule
   * edits there are: somebody fixing the time of day, and somebody adding a
   * session on another weekday, which a list position would re-key every later
   * slot on (and a client answers a re-key by deleting the event and creating
   * it again). It exists for the rarer product with two sessions on one day,
   * where a weekday-only UID would collapse both into one event in the client.
   */
  ordinalOnWeekday: number;
}

/** The product's slots in a deterministic order, with their UID components. */
function orderedSlots(slots: readonly SlotShape[]): FeedSlot[] {
  const sorted = [...slots].sort(
    (a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime),
  );
  const seenOnWeekday = new Map<number, number>();
  return sorted.map((slot) => {
    const ordinal = seenOnWeekday.get(slot.weekday) ?? 0;
    seenOnWeekday.set(slot.weekday, ordinal + 1);
    return {
      weekday: slot.weekday,
      startTime: slot.startTime,
      durationMinutes: slot.durationMinutes,
      ordinalOnWeekday: ordinal,
    };
  });
}

/** The later of two optional instants — the mirror of `earlierBoundary`. */
function laterBoundary(a: Date | null, b: Date): Date {
  return a !== null && a.getTime() > b.getTime() ? a : b;
}

function summaryFor(
  options: CalendarFeedOptions,
  productName: string,
  gamerName: string,
): string {
  switch (options.title) {
    case "product":
      return productName;
    case "product-gamer":
      return `${productName} ${EN_DASH} ${gamerName}`;
    case "gamer-product":
      return `${gamerName} ${EN_DASH} ${productName}`;
  }
}

/**
 * A language's name in the reader's own locale, exactly as the app resolves one
 * — no stored display names, no hand-kept map.
 */
function spokenLanguageName(code: string, locale: SupportedLocale): string {
  try {
    // "en" as the second entry keeps the answer deterministic for a locale Intl
    // has no data for, rather than falling through to the runtime default.
    return (
      new Intl.DisplayNames([locale, "en"], {
        type: "language",
        fallback: "none",
      }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

interface TextContext {
  options: CalendarFeedOptions;
  translate: CalendarFeedTranslator;
  locale: SupportedLocale;
  origin: string;
}

function descriptionFor(
  context: TextContext,
  seat: FeedSeat,
  durationMinutes: number,
): string | null {
  const { options, translate, locale } = context;
  if (options.details === "none") return null;

  const typeNoun = translate.productType(seat.productType);
  const lines = [
    translate.feed("gamerLine", { name: seat.gamerName }),
    translate.feed("typeLine", { type: typeNoun }),
  ];
  if (options.details === "full") {
    lines.push(
      translate.feed("languageLine", {
        language: spokenLanguageName(seat.spokenLanguageCode, locale),
      }),
      translate.feed("durationLine", { minutes: durationMinutes }),
    );
  }
  return lines.join("\n");
}

function locationFor(context: TextContext, seat: FeedSeat): string | null {
  const { options, translate } = context;
  if (options.details === "none") return null;
  // Gated on `isRemote` rather than on whether a place is named, exactly as the
  // dashboard is: a remote municipality club carries a location too (the
  // municipality that commissioned it), and that is an administrative fact, not
  // a building anyone travels to.
  if (seat.isRemote) return translate.feed("online");
  return seat.locationName;
}

function urlFor(context: TextContext, seat: FeedSeat): string | null {
  if (context.options.details !== "full") return null;
  // An unplaced seat has no page to point at — the family product page is
  // keyed on the group and renders not-found without one, which is why the
  // dashboard's rollup deliberately emits no link for such a seat either.
  if (!seat.isPlaced) return null;
  // The parent's own page for this seat — the `customer` root, because the
  // subscriber is the paying parent. Absolute, and its origin comes from the
  // request rather than the Host header; see the route.
  return `${context.origin}${ROUTES.customer.enrollment(seat.productType, seat.participationId)}`;
}

export interface BuildCalendarFeedEventsArgs {
  seats: readonly FeedSeat[];
  options: CalendarFeedOptions;
  translate: CalendarFeedTranslator;
  locale: SupportedLocale;
  /** Absolute origin for any link the events carry. */
  origin: string;
  now: Date;
}

/**
 * Expand every seat into the events the feed states, sorted soonest first.
 *
 * Discrete mode walks each slot forward to the horizon and back one week, so
 * the current week reads complete. Recurring mode states each slot once, as a
 * weekly rule anchored on its **first** occurrence — and always with a
 * `TZID`-stated `DTSTART`, because a weekly rule hung off a UTC instant drifts
 * an hour across a DST transition while the wall clock, which is what the
 * schedule actually promises, does not move.
 */
export function buildCalendarFeedEvents(
  args: BuildCalendarFeedEventsArgs,
): CalendarFeedEvent[] {
  const { seats, options, translate, locale, origin, now } = args;
  const context: TextContext = { options, translate, locale, origin };

  const onlyParticipant = scopedParticipantId(options);
  const scoped =
    onlyParticipant === null
      ? seats
      : seats.filter((seat) => seat.participantId === onlyParticipant);

  const events: CalendarFeedEvent[] = [];

  for (const seat of scoped) {
    const slots = orderedSlots(seat.slots);
    if (slots.length === 0) continue;

    const summary = summaryFor(options, seat.productName, seat.gamerName);

    const startBoundary = startDateToCutoff(seat.startDate, seat.timezone);
    const runEnd = earlierBoundary(
      endDateToCutoff(seat.endDate, seat.timezone),
      seat.cancelsAt,
    );

    const shared = {
      summary,
      location: locationFor(context, seat),
      url: urlFor(context, seat),
      timezone: seat.timezone,
      gamerName: seat.gamerName,
      productName: seat.productName,
      productType: seat.productType,
    };

    for (const slot of slots) {
      const description = descriptionFor(context, seat, slot.durationMinutes);

      if (options.mode === "rrule") {
        const anchor = enumerateRowOccurrences({
          slots: [slot],
          timezone: seat.timezone,
          // Anchor the rule on the run's own first session, not on today's:
          // an RRULE whose DTSTART is next week describes a different series
          // from the one the family bought.
          now: startBoundary ?? now,
          startBoundary,
          endBoundary: runEnd,
          cap: 1,
          windowCloseMs: 0,
        });
        // Guarded on the length rather than on the element: indexed access is
        // typed as always-present here, so an `=== undefined` check would read
        // as a test the compiler has already refused to make. A run whose
        // schedule is entirely behind its end date yields nothing, and there is
        // no rule to state.
        if (anchor.length === 0) continue;
        const first = anchor[0];

        events.push({
          ...shared,
          uid: `${seat.participationId}-slot-${slot.weekday}-${slot.ordinalOnWeekday}@sogverse`,
          start: first.start,
          end: first.end,
          description,
          rrule:
            `FREQ=WEEKLY;BYDAY=${BYDAY[slot.weekday]}` +
            (runEnd === null ? "" : `;UNTIL=${formatUtcTimestamp(runEnd)}`),
        });
        continue;
      }

      // Instant arithmetic, not calendar arithmetic: "twelve weeks from this
      // poll" is a duration, so no wall clock is being stepped and DST has
      // nothing to say about it.
      const horizon = new Date(
        now.getTime() + horizonWeeks(options) * 7 * DAY_MS,
      );
      const lookback = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS);

      const future = enumerateRowOccurrences({
        slots: [slot],
        timezone: seat.timezone,
        now,
        startBoundary,
        endBoundary: earlierBoundary(runEnd, horizon),
        // Uncapped, and safely so: the boundary above is never null.
        cap: Infinity,
        windowCloseMs: 0,
      });
      const past = enumeratePastRowOccurrences({
        slots: [slot],
        timezone: seat.timezone,
        now,
        floor: laterBoundary(startBoundary, lookback),
        endBoundary: runEnd,
        maxOccurrences: MAX_PAST_OCCURRENCES_PER_SLOT,
      });

      // A session in progress right now is emitted by both walks — the forward
      // one surfaces it deliberately, the backward one because it started
      // before `now`. One event, so dedupe on the start instant.
      const seen = new Set<number>();
      for (const occurrence of [...past, ...future]) {
        if (seen.has(occurrence.start.getTime())) continue;
        seen.add(occurrence.start.getTime());
        const date = productLocalDate(occurrence.start, seat.timezone);
        events.push({
          ...shared,
          uid: `${seat.participationId}-${date}-${slot.ordinalOnWeekday}@sogverse`,
          start: occurrence.start,
          end: occurrence.end,
          description,
          rrule: null,
        });
      }
    }
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return events;
}
