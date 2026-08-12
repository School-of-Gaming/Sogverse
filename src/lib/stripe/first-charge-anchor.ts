import { fromZonedTime } from "date-fns-tz";
import { formatDate, formatDateOnly } from "@/lib/utils";

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
 * charge lands; the confirmation restates it afterwards. One computation, so
 * none of them can disagree — which is why the *rendering* rule
 * (`formatFirstChargeDate`) lives here too rather than at each surface.
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
 * How close to "now" a start instant may be and still be worth deferring to.
 *
 * The real constraint is that the anchor is computed when the Checkout Session
 * is *created*, but the subscription it parameterises is created when the
 * session is *completed* — up to `CHECKOUT_SESSION_LIFETIME_MINUTES` (30) later,
 * plus however long the parent spends on Stripe's page. An anchor that has
 * fallen into the past by then is rejected outright, and the parent meets that
 * failure at the payment page with a card in their hand. An hour covers that
 * whole session lifetime with room for clock skew between us and Stripe.
 *
 * A club starting inside the hour is effectively starting now, so charging at
 * checkout is also the honest answer — the same one every launch-day club has
 * always got.
 */
const MIN_ANCHOR_LEAD_MS = 60 * 60 * 1000;

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
 * Returns `null` for a product with no start date and for one starting in the
 * past, now, or inside the next hour — a stale date or a launch-day club is
 * charged at checkout, which is exactly what happens without an anchor, and the
 * hour is the floor that keeps an anchor from expiring inside the Checkout
 * Session's own lifetime (see `MIN_ANCHOR_LEAD_MS`).
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
  if (startMs - nowMs < MIN_ANCHOR_LEAD_MS) return null;

  const ceilingMs = nowMs + MAX_ANCHOR_LEAD_MS - ANCHOR_CLOCK_SKEW_MARGIN_MS;
  return new Date(Math.min(startMs, ceilingMs));
}

/**
 * Is this first-charge instant the club's own start, rather than a clamped one?
 *
 * Compared at **whole seconds**, because that is the resolution the value
 * survives a round trip at: the anchor is sent to Stripe as epoch seconds, comes
 * back as the subscription's period end, and is read off our row as a timestamp.
 * Product-local midnight has no sub-second part to lose, so the floor only
 * absorbs noise added on the way.
 */
export function isFirstChargeAtProductStart(
  chargeAt: Date,
  startDate: string,
  timezone: string,
): boolean {
  const startMs = productLocalStartInstant(startDate, timezone).getTime();
  const chargeMs = chargeAt.getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(chargeMs)) return false;
  return Math.floor(chargeMs / 1000) === Math.floor(startMs / 1000);
}

/**
 * The parent-facing date of a first charge — the single rule both surfaces that
 * state one (the shop's signup panel before the click, the confirmation after
 * it) render through, so a parent cannot be shown two different days for the
 * same charge.
 *
 * The rule turns on whether the anchor was clamped:
 *
 *   - **Unclamped** — the charge instant *is* the club's start date, so it is
 *     rendered as that bare calendar date, identical to the start date shown
 *     everywhere else on the page. Projecting it into a viewer's zone would slip
 *     it a day for anyone west of the product's zone and make the same club
 *     start on two different dates on one screen.
 *   - **Clamped** — the charge is a true instant with no calendar date of its
 *     own, so it goes into the **viewer's** zone: that is the day the money
 *     leaves their account and the day their statement will name.
 */
export function formatFirstChargeDate(
  chargeAt: Date | string,
  startDate: string | null,
  timezone: string,
  locale: string,
  viewerTimezone: string,
): string {
  const instant = typeof chargeAt === "string" ? new Date(chargeAt) : chargeAt;
  if (
    startDate !== null &&
    isFirstChargeAtProductStart(instant, startDate, timezone)
  ) {
    return formatDateOnly(startDate, locale);
  }
  return formatDate(instant, locale, {
    dateStyle: "medium",
    timeZone: viewerTimezone,
  });
}
