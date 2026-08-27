import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";

/**
 * What a seat offer *is* right now, derived from the one stamp the row stores.
 *
 * **Nothing about an offer's standing is stored, and this is the whole reason
 * that works.** The database keeps `seat_offer_sent_at` and derives live-vs-
 * expired against the same five-day window every time anybody asks; so does
 * this. A stored "live" flag would need somebody to come along and turn it off
 * when the window closed — which is a clock, which is a cron job, which is the
 * thing the feature was designed not to need. Two readers evaluating one
 * predicate cannot disagree; a reader and a sweeper can.
 *
 * Both surfaces that draw an offer read it through here: the admin waitlist
 * card, which needs to know whether a family has been asked and how long they
 * have left, and the family's own My SOG card, which needs the deadline it is
 * promising. Keeping the arithmetic in one place is what keeps the two from
 * drifting a millisecond apart and showing a family an offer the admin's panel
 * already calls expired.
 */
export type SeatOfferState =
  /** Nobody has offered this family a seat — an ordinary queue place. */
  | { kind: "none" }
  /** Asked, and the window is still open. */
  | { kind: "live"; sentAt: Date; deadline: Date; remainingMs: number }
  /**
   * Asked, and the window closed with no answer. The row is still waitlisted
   * and can be offered afresh — an expired offer is a fact about the past, not
   * a state the family is stuck in.
   */
  | { kind: "expired"; sentAt: Date; deadline: Date };

/**
 * Read the stamp against a clock.
 *
 * `now` is passed in rather than read here so a render can drive it from the
 * shared render clock (and a test from a fixed instant) — a function that
 * called `new Date()` itself would produce a different answer on the server and
 * on the client for the same paint, which is a hydration mismatch on every
 * surface that draws one of these.
 *
 * A stamp that will not parse answers `none`. The column is a `timestamptz` so
 * it cannot realistically be malformed, but the alternative to handling it here
 * is a `NaN` deadline formatted into somebody's card as "Invalid Date".
 */
export function seatOfferState(
  sentAt: string | null,
  now: Date,
): SeatOfferState {
  if (sentAt === null) return { kind: "none" };

  const sent = new Date(sentAt);
  if (Number.isNaN(sent.getTime())) return { kind: "none" };

  const deadline = new Date(sent.getTime() + SEAT_OFFER_WINDOW_MS);
  const remainingMs = deadline.getTime() - now.getTime();

  // Strictly greater than zero, matching the database's `sent_at + interval '5
  // days' > now()`. The boundary instant belongs to the expired side on both.
  return remainingMs > 0
    ? { kind: "live", sentAt: sent, deadline, remainingMs }
    : { kind: "expired", sentAt: sent, deadline };
}

/**
 * How much of the window is left, bucketed to the unit a reader can act on.
 *
 * **The buckets are chosen so the number does not tick.** The render clock
 * advances every thirty seconds, and a countdown that repainted a digit on that
 * beat would be a change on data's own schedule in a row full of drag handles.
 * Days change once a day and hours once an hour, so what is on screen is stable
 * for as long as anybody is looking at it — and the sub-hour tail collapses to
 * a wordless "almost out of time" rather than counting minutes at a family
 * nobody is waiting on in real time.
 *
 * Floor rather than round, in both units: "2 days left" with fifty-nine hours
 * on the clock is a promise the deadline keeps, while "3 days left" with
 * forty-nine is one it does not.
 */
export type SeatOfferRemaining =
  | { unit: "days"; value: number }
  | { unit: "hours"; value: number }
  /** Under an hour — stated as a warning rather than a number. */
  | { unit: "lastHour" };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function seatOfferRemaining(remainingMs: number): SeatOfferRemaining {
  if (remainingMs >= DAY_MS) {
    return { unit: "days", value: Math.floor(remainingMs / DAY_MS) };
  }
  if (remainingMs >= HOUR_MS) {
    return { unit: "hours", value: Math.floor(remainingMs / HOUR_MS) };
  }
  return { unit: "lastHour" };
}
