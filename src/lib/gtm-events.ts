/**
 * What the browser pushes into `dataLayer`, named once so the app and the
 * container agree about the same word.
 *
 * **These are Google's names, not Meta's, and the difference is deliberate.**
 * `marketing-events.ts` holds Meta's vocabulary, where the platform optimises a
 * campaign on the event name. Google reads its own dictionary: a tag built on
 * `sign_up` or `begin_checkout` is recognised by GA4's reporting and by Ads
 * conversion import, where `Lead` or `InitiateCheckout` would arrive as an
 * unrecognised custom event and forfeit both. The two vocabularies name the same
 * moments and sit beside each other rather than merging, because merging them
 * would mean one of the platforms being told a word it does not know.
 *
 * Client-safe and React-free: the components that push these import it directly.
 *
 * **Every enrolment is pushed, including the ones no conversion is reported
 * for.** Meta is told only about advertised products, because a conversion for a
 * product nobody advertised is noise a campaign would be optimised against. That
 * reasoning belongs to an advertising platform and not to analytics, where
 * leaving them out would make the numbers disagree with our own database. So the
 * decision travels *with* the event as `advertised`, and which vendor acts on it
 * is decided per tag in the container: analytics counts them all, an advertising
 * tag takes the subset. One event, two readings, and the rule stated once in the
 * data rather than twice in two places that can drift.
 */

import type { EnrolmentOutcome } from "./marketing-events";

/**
 * The event names, in Google's taxonomy.
 *
 *   - `page_view` — a marketing page was reached. Pushed by us rather than left
 *     to the tag, for the same reason Meta's automatic page view is turned off:
 *     an automatic one fires on every client navigation, including into the
 *     pages that carry a token or name a child.
 *   - `sign_up` — a parent account now exists and nothing has been signed up
 *     *for*. GA4's recommended name for exactly that.
 *   - `enrolment` — a seat or a queue place was taken. Custom rather than
 *     recommended: GA4's list has no word for registering for a thing, and
 *     `purchase` would be a lie about the free ones.
 *   - `begin_checkout` — the parent has been handed to Stripe and has paid
 *     nothing yet. Reporting this as an enrolment would teach an ad platform to
 *     find people who *start* paying.
 */
export const GTM_EVENTS = {
  pageView: "page_view",
  accountCreated: "sign_up",
  enrolment: "enrolment",
  checkout: "begin_checkout",
} as const;

export type GtmEventName = (typeof GTM_EVENTS)[keyof typeof GTM_EVENTS];

/**
 * The path the event happened on, stated by the caller.
 *
 * **Never read from the address bar by the tag.** A tag left to its own devices
 * reads `document.location` at the moment it fires, which is whatever the tab
 * shows by then — and a push can outlive a navigation. Our servers already take
 * this care on their side of the wire, building the source URL from a trusted
 * origin and a path the caller states rather than from the incoming request. The
 * browser side holds the same line: the page that authorised the event names
 * itself, and a tag configured to read this field cannot report a page the
 * visitor merely happened to reach.
 */
interface GtmEventBase {
  event: GtmEventName;
  /**
   * The internal path: locale prefix removed and the slug untranslated, but the
   * record's own id kept — `/shop/abc123`, never the address bar's
   * `/fi/kauppa/abc123` and never the `/shop/[id]` template.
   *
   * The id stays because the event carries no product of its own, so a template
   * would collapse every enrolment the shop has ever taken into one row. It is
   * safe to keep: a product page is a public marketing URL naming a product, not
   * a person, which is the whole distinction the page allowlist draws.
   */
  page_path: string;
}

/** A marketing page was reached. */
export interface GtmPageViewEvent extends GtmEventBase {
  event: typeof GTM_EVENTS.pageView;
}

/** A parent account was created. Carries nothing else: nothing else is known. */
export interface GtmSignUpEvent extends GtmEventBase {
  event: typeof GTM_EVENTS.accountCreated;
}

/**
 * A signup attempt ended in something worth reporting.
 *
 * `outcome` is the same three words the Meta side uses, so a reader comparing
 * the two platforms is not also translating. `advertised` is the product
 * decision described in this module's header.
 */
export interface GtmEnrolmentEvent extends GtmEventBase {
  event: typeof GTM_EVENTS.enrolment | typeof GTM_EVENTS.checkout;
  outcome: EnrolmentOutcome;
  advertised: boolean;
}

export type GtmEvent = GtmPageViewEvent | GtmSignUpEvent | GtmEnrolmentEvent;

/**
 * A container id is `GTM-` and a run of capitals and digits.
 *
 * Checked rather than assumed, and for the same reason the pixel id is: an unset
 * variable is the ordinary case — the container is off, which is what every
 * environment but Preview and Production gets — and a variable still holding the
 * placeholder from `.env.local.example` must read as off rather than as a
 * container that will 404 on every page.
 */
export function isValidGtmContainerId(id: string | undefined): id is string {
  return id !== undefined && /^GTM-[A-Z0-9]{4,20}$/.test(id);
}
