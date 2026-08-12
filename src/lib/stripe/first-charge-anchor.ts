import { fromZonedTime } from "date-fns-tz";

/**
 * When a consumer club's first subscription invoice should fall.
 *
 * A club can be listed for signup before it starts, and a subscription created
 * through Stripe Checkout bills immediately — so a parent buying a club that
 * starts in three weeks would pay for three weeks of nothing. The fix is
 * `subscription_data.billing_cycle_anchor` (plus `proration_behavior: "none"`)
 * on the Checkout Session: the parent pays €0 today, the subscription is
 * `active` at once, and the first full invoice fires at the anchor.
 *
 * **This module is deliberately pure and client-safe**: no Stripe SDK, no
 * secrets, no I/O. The checkout route uses it to set the anchor; the public
 * signup panel uses it to tell the parent, before they click, when the first
 * charge lands. One computation, so the two cannot disagree.
 *
 * **Date handling is deliberately arithmetic-free.** There is exactly one
 * zone-aware step — `fromZonedTime`, turning the bare `start_date` into an
 * instant in the product's own zone — and everything after it is epoch
 * milliseconds. No calendar stepping, no `setDate`, no DST exposure: Stripe
 * compares instants, not wall clocks.
 */

/**
 * How far ahead of "now" the anchor may sit.
 *
 * Stripe rejects a `billing_cycle_anchor` later than the buyer's **next natural
 * billing date** — the same day-of-month one month after the session is created,
 * for our monthly prices — at session creation, with "The
 * billing_cycle_anchor cannot be later than next natural billing date."
 *
 * 28 days is always inside that limit: the worst case is a purchase on 31
 * January, whose next natural billing date is 28 February, exactly 28 days
 * later. (The boundary itself is accepted by Stripe; the margin below is only
 * for clock skew.)
 */
const MAX_ANCHOR_LEAD_MS = 28 * 24 * 60 * 60 * 1000;

/**
 * Shaved off the ceiling so that our clock running a little ahead of Stripe's
 * cannot turn an exactly-on-the-boundary anchor into a rejected one. An hour is
 * far more skew than any real deployment has, and costs nothing: the clamped
 * date only moves when a parent buys more than four weeks ahead, and it is
 * displayed honestly wherever it is stated.
 */
const ANCHOR_CLOCK_SKEW_MARGIN_MS = 60 * 60 * 1000;

/**
 * The instant a product's `start_date` begins, in the product's own timezone.
 *
 * Midnight, product-local — not the first session's slot time. The charge lands
 * on the same calendar day either way, and midnight needs no schedule lookup.
 * This is the one place the root `CLAUDE.md` date rules' entity-local exception
 * is taken: a bare date is normally rendered UTC-pinned, but converting one into
 * a billing instant is a question about the product's calendar, not a viewer's.
 */
export function productLocalStartInstant(
  startDate: string,
  timezone: string,
): Date {
  return fromZonedTime(`${startDate}T00:00:00`, timezone);
}

/**
 * The instant Stripe should raise the first invoice on, or `null` when billing
 * should start immediately (today's behaviour, unchanged).
 *
 * Returns `null` for a product with no start date and for one starting now or
 * in the past — a stale date or a launch-day club is charged at checkout, which
 * is exactly what happens without an anchor.
 *
 * Otherwise the answer is `min(start instant, now + 28 days − 1 hour)`. A parent
 * buying more than about four weeks ahead is therefore charged **before** the
 * club starts, which is an accepted product decision: early commitment is worth
 * more than perfectly aligned billing, and because the value is clamped Stripe
 * can never reject it, so no per-purchase error path exists.
 */
export function firstChargeAnchor(
  startDate: string | null,
  timezone: string,
  now: Date,
): Date | null {
  if (!startDate) return null;

  const startMs = productLocalStartInstant(startDate, timezone).getTime();
  // A malformed stored date parses to NaN; treat it as "no deferral" rather
  // than sending Stripe a nonsense anchor.
  if (!Number.isFinite(startMs)) return null;

  const nowMs = now.getTime();
  if (startMs <= nowMs) return null;

  const ceilingMs = nowMs + MAX_ANCHOR_LEAD_MS - ANCHOR_CLOCK_SKEW_MARGIN_MS;
  return new Date(Math.min(startMs, ceilingMs));
}
