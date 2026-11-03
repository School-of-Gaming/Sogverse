// Constants specific to the participation lifecycle.
// Pricing/discount constants live in src/lib/constants/pricing.ts.

import type { ParticipationStatus } from "@/types";

/**
 * How long a Stripe Checkout Session stays payable. **This bounds a stale tab,
 * not a seat**: nothing is held while a parent pays, so an expiring session
 * releases nothing and the expiry event is not even handled.
 *
 * What it does bound is a session left open and paid much later. The Session
 * bakes in the amount at creation, so a forgotten tab is a payable snapshot of a
 * price that may since have changed — and the participation it creates lands
 * whenever the payment does, long after the parent looked at the product. Thirty
 * minutes is Stripe's minimum, and the shortest honest answer to "is this page
 * still the offer we made?".
 */
export const CHECKOUT_SESSION_LIFETIME_MINUTES = 30;

/**
 * How the confirmation page waits for the participation a paid Checkout Session
 * bought. Stripe waits on our webhook for up to ten seconds before redirecting,
 * so the row is normally there on the first server render and neither of these
 * is ever used; they govern the edge path where the webhook failed or ran long.
 *
 * The wait is bounded on purpose. An unbounded poll under "this only takes a
 * moment" is a lie the page tells forever when the row is never coming — the
 * parent needs to be told to check My SOG or contact us, not left spinning.
 */
export const CONFIRMATION_POLL_INTERVAL_MS = 2_000;
export const CONFIRMATION_POLL_TIMEOUT_MS = 30_000;

/**
 * Hours-before-session window inside which a cancellation no longer earns
 * a credit (sub-covered) or a no-charge (bundle-covered).
 */
export const PARTICIPATION_CHARGE_WINDOW_HOURS = 24;

/**
 * The status of a seat a participant holds now — the TypeScript twin of the
 * database's `is_live_seat()`. An `ended` seat was held and is kept as history;
 * a `waitlisted` row is a place in line, not a seat.
 */
export const HELD_SEAT_STATUSES = [
  "active",
] as const satisfies readonly ParticipationStatus[];

/**
 * The statuses that occupy a participant's place on a product: a held seat or a
 * waitlist place. Exactly the set the participations unique index covers, so a
 * row in it blocks a second booking, move or switch onto that product, and an
 * ended row leaves the pair free for the family to come back.
 */
export const OCCUPYING_STATUSES = [
  "active",
  "waitlisted",
] as const satisfies readonly ParticipationStatus[];

export type OccupyingStatus = (typeof OCCUPYING_STATUSES)[number];

export function isOccupyingStatus(status: string): status is OccupyingStatus {
  return (OCCUPYING_STATUSES as readonly string[]).includes(status);
}

export function isHeldSeatStatus(
  status: string,
): status is (typeof HELD_SEAT_STATUSES)[number] {
  return (HELD_SEAT_STATUSES as readonly string[]).includes(status);
}
