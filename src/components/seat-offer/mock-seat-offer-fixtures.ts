import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";

/**
 * Fixtures for the seat-offer landing page's preview scene.
 *
 * The page a family opens from the offer mail is the one surface in this
 * feature that **cannot be looked at without a live token**: the link carries a
 * signed credential naming a real waitlisted row, so short of minting one by
 * hand the only state anybody could reach was the dead-link card, by putting
 * rubbish in the query string. These fixtures are what make the rest
 * reviewable.
 *
 * There is no avatar anywhere on this page and therefore no identicon to feed,
 * which is why nothing here is a UUID: the whole fixture is the three strings
 * the page prints and the instant it counts down to.
 */

/**
 * The states the page can be met in, and the URL segments they are served on.
 *
 * These are **the values of the one piece of state the page keys on**, which is
 * why there is a link per state rather than one busy page: the panel replaces
 * itself outright, so no two of these can ever be compared side by side however
 * the scene is written.
 *
 * Two of them are *arrival points* rather than the only way to see a card.
 * Accepting or declining inside `live` walks into the same panels `accepted`
 * and `declined` serve — the answer is inert but the panel really changes — and
 * declining inside `expired` reaches the declined card too, by the same route
 * the live offer takes.
 *
 * `expired` is the one that is not a card at all. A lapsed offer still has an
 * answer in it, so the scenario exists to show the decline affordance sitting
 * under copy that says the seat has gone; its confirmation step works against
 * local state like every other. `used` and `dead-link` are the two nobody can
 * press their way to, because the fixture responder answers truthfully.
 */
export const SEAT_OFFER_SCENARIOS = [
  "live",
  "expired",
  "accepted",
  "declined",
  "used",
  "dead-link",
] as const;

export type SeatOfferScenario = (typeof SEAT_OFFER_SCENARIOS)[number];

export function isSeatOfferScenario(value: string): value is SeatOfferScenario {
  return (SEAT_OFFER_SCENARIOS as readonly string[]).includes(value);
}

/**
 * Who the offer is for and what it is for.
 *
 * A child's seat rather than a parent's own: the self-worded sentence is one
 * `isSelfSeat` away and reads as a shorter version of the same panel, while the
 * named-child wording is what nearly every real offer carries and the one whose
 * line length is worth judging.
 */
export const SEAT_OFFER_FIXTURE = {
  participantName: "Aino",
  productName: "Minecraft Creative Club",
  /**
   * The credential the real page is opened with, and the one thing here that is
   * never used: the scene answers through its own responder, so this token
   * reaches no route. It is a plausible string rather than an empty one so
   * nothing downstream can mistake the scene for the missing-token case the live
   * page rejects before it renders anything.
   */
  token: "preview-scene-token",
  /**
   * The zone the deadline is stated in — the *product's*, matching the mail
   * exactly, which is the whole reason the live page formats it with the zone
   * named rather than in the reader's own.
   */
  timeZone: "Europe/Helsinki",
} as const;

/**
 * When the offer runs out, derived from the render clock the way the real one
 * is derived from the stored stamp.
 *
 * The offer is a day and a half old, so the deadline lands three and a half days
 * out: far enough to read as a real window rather than a countdown, and near
 * enough that the sentence names a weekday somebody can picture. Anchoring it to
 * `now` is what keeps the scene from rotting — a hardcoded date would be in the
 * past by the time anyone next opened the page.
 */
export function seatOfferFixtureDeadline(now: Date): Date {
  const sentAt = now.getTime() - 36 * 60 * 60 * 1000;
  return new Date(sentAt + SEAT_OFFER_WINDOW_MS);
}
