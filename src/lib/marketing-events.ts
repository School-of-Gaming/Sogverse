/**
 * What we report to an advertising platform, named once for both sides of the
 * wire: the browser reports the page view, our servers report the conversions,
 * and both have to mean the same thing by the same word.
 *
 * Client-safe and React-free — the component and the route handlers both import
 * it.
 *
 * **Meta optimises a campaign on the event *name*.** That is the whole reason
 * this is a vocabulary rather than four string literals at four call sites: the
 * platform learns "find more people who do *this*", so the name decides what it
 * goes looking for, and a name used loosely trains it on the wrong thing.
 *
 *   - `Lead` — someone reachable who has committed to nothing: an account
 *     exists, and that is all. Reported when a parent registers.
 *   - `CompleteRegistration` — registering *for* something: a seat on a product
 *     or a place in its queue. The word in Meta's taxonomy is about signing up
 *     for a thing, not about creating a login, which is why account creation is
 *     the `Lead` above and not this.
 *   - `InitiateCheckout` — the parent has been handed to Stripe and has not paid
 *     yet. Reporting this as an enrolment would teach Meta to find people who
 *     *start* paying, and an abandoned checkout would train the campaign exactly
 *     as hard as a completed one.
 *
 * The three enrolment outcomes travel beside the name as `outcome`, so a report
 * can separate "took a seat" from "joined the queue" from "went to Stripe"
 * without the names having to carry it — three labels, spelled one way, in every
 * report.
 */

import type { BillingMode, ProductType } from "@/types";

export const PIXEL_EVENTS = {
  pageView: "PageView",
  accountCreated: "Lead",
  enrolment: "CompleteRegistration",
  checkout: "InitiateCheckout",
} as const;

/** The three ways a signup attempt can end in something worth reporting. */
export const ENROLMENT_OUTCOMES = [
  "enrolled",
  "waitlisted",
  "sent_to_checkout",
] as const;

export type EnrolmentOutcome = (typeof ENROLMENT_OUTCOMES)[number];

/** Which event name each outcome is reported under. */
export const ENROLMENT_EVENTS = {
  enrolled: PIXEL_EVENTS.enrolment,
  waitlisted: PIXEL_EVENTS.enrolment,
  sent_to_checkout: PIXEL_EVENTS.checkout,
} as const satisfies Record<EnrolmentOutcome, string>;

/**
 * Whether a product is one we advertise, and therefore one whose signups are
 * worth reporting as conversions.
 *
 * **Decided by the product, never by the URL it was reached from.** Two kinds
 * are excluded, and both for the same reason: nobody is being advertised to, so
 * a conversion report would be noise a campaign is optimised against. A
 * municipality club is arranged with a council and its families arrive through
 * their school; a product invoiced off-platform is settled by contract, so there
 * is no purchase for an ad to have caused.
 */
export function isAdvertisedProduct(product: {
  product_type: ProductType;
  billing_mode: BillingMode;
}): boolean {
  if (product.product_type === "municipality_club") return false;
  if (product.billing_mode === "external_contract") return false;
  return true;
}

/**
 * A pixel id is a run of digits and nothing else — Meta's advertiser id.
 *
 * Checked rather than assumed on both sides of the wire: an unset variable is
 * the ordinary case (the pixel is off, which is what every environment but
 * production gets), and a variable holding a placeholder like
 * `your-meta-pixel-id` must read as off rather than as a pixel that will 400 on
 * every event.
 */
export function isValidPixelId(id: string | undefined): id is string {
  return id !== undefined && /^\d{1,32}$/.test(id);
}
