/**
 * What the browser pushes into `dataLayer`, named once so the app and the
 * container agree about the same word.
 *
 * **The container is where every browser advertising tag is built**, so these
 * events are the whole funnel, each one complete enough for a tag to be made
 * from it without asking the app for anything: the page, the product view, the
 * click into the sign-up flow, the account, the enrolment and the Stripe
 * handoff, each with its own id and, where there is one, the product.
 *
 * **These are Google's names, not Meta's, and the difference is deliberate.**
 * `marketing-events.ts` holds Meta's vocabulary, where the platform optimises a
 * campaign on the event name. Google reads its own dictionary: a tag built on
 * `sign_up` or `begin_checkout` is recognised by GA4's reporting and by Ads
 * conversion import, where `Lead` or `InitiateCheckout` would arrive as an
 * unrecognised custom event and forfeit both. A Meta or Reddit tag in the
 * container maps each of these to its own platform's word, which is the
 * mapping `marketing-events.ts` states — and their checkout words do not even
 * name the same moment: `begin_checkout` is the handoff to Stripe, Meta's
 * `InitiateCheckout` the click into the sign-up flow before it, which is
 * `add_to_cart` here.
 *
 * Client-safe and React-free: the components that push these import it directly.
 *
 * **Every product event is pushed, including the ones no conversion is reported
 * for.** Meta is told only about advertised products, because a conversion for a
 * product nobody advertised is noise a campaign would be optimised against. That
 * reasoning belongs to an advertising platform and not to analytics, where
 * leaving them out would make the numbers disagree with our own database. So the
 * decision travels *with* the event as `advertised`, and which vendor acts on it
 * is decided per tag in the container: analytics counts them all, an advertising
 * tag takes the subset. One event, two readings, and the rule stated once in the
 * data rather than twice in two places that can drift.
 */

import type { EnrolmentOutcome, GtmEcommerce } from "./marketing-events";

/**
 * The event names, in Google's taxonomy.
 *
 *   - `page_view` — a marketing page was reached. Pushed by us rather than left
 *     to the tag, for the same reason Meta's automatic page view is turned off:
 *     an automatic one fires on every client navigation, including into the
 *     pages that carry a token or name a child.
 *   - `view_item` — a product page showed its product. GA4's recommended name
 *     for exactly that, and Meta's `ViewContent`.
 *   - `add_to_cart` — the parent clicked into the sign-up flow from a product's
 *     page: Meta's `InitiateCheckout`, Reddit's `AddToCart`. GA4 has no word for
 *     stepping into a sign-up, and `begin_checkout` is the Stripe handoff below
 *     and keeps that meaning. `add_to_cart` is GA4's recommended name for the
 *     step its own funnel puts between those two — `view_item`, `add_to_cart`,
 *     `begin_checkout` — and it fits for the reasons it is Reddit's word: it
 *     commits nothing, it names one product, and it comes before the checkout.
 *     A custom name would have cost GA4's funnel report its middle step.
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
  productView: "view_item",
  checkoutStart: "add_to_cart",
  accountCreated: "sign_up",
  enrolment: "enrolment",
  checkout: "begin_checkout",
} as const;

export type GtmEventName = (typeof GTM_EVENTS)[keyof typeof GTM_EVENTS];

/** What every push carries: its name, its own id, and the path it happened on. */
interface GtmEventBase {
  event: GtmEventName;
  /**
   * This event's own id, a fresh `crypto.randomUUID()` for every push.
   *
   * **It is what lets one moment be reported twice and counted once.** A
   * platform deduplicates a browser event against a server report of the same
   * name by this id. For the two moments our servers commit — `sign_up` and a
   * free seat or queue place's `enrolment` — the browser mints it, sends it to
   * the route that commits the action, and pushes under the same id once the
   * route has answered. For the browser's own three — `page_view`, `view_item`
   * and `add_to_cart` — it pushes first and then posts the push, id and all,
   * to `/api/page-events` (`@/lib/page-events`). Either way the server hands it
   * to each platform as that platform's dedup key. A `begin_checkout` carries
   * one too, so a tag built on any event has an id to send without anybody
   * deciding which events deserve one.
   *
   * Minted per push, never per page or per product: a second view of the same
   * page is a second event, and an id shared with the first would have the
   * platform discard it as a duplicate.
   */
  event_id: string;
  /**
   * The internal path: locale prefix removed and the slug untranslated, but the
   * record's own id kept — `/shop/abc123`, never the address bar's
   * `/fi/kauppa/abc123` and never the `/shop/[id]` template.
   *
   * **Never read from the address bar by the tag.** A tag left to its own
   * devices reads `document.location` at the moment it fires, which is whatever
   * the tab shows by then — and a push can outlive a navigation. Our servers
   * already take this care on their side of the wire, building the source URL
   * from a trusted origin and a path the caller states rather than from the
   * incoming request. The browser side holds the same line: the page that
   * authorised the event names itself, and a tag configured to read this field
   * cannot report a page the visitor merely happened to reach.
   *
   * The id stays because a funnel is drawn across events that name their page
   * the same way, and a template would collapse every product the shop has into
   * one row. It is safe to keep: a product page is a public marketing URL naming
   * a product, not a person, which is the whole distinction the page allowlist
   * draws.
   */
  page_path: string;
}

/** The product a product event is about, and whether we advertise it. */
interface GtmProductFields {
  /**
   * In GA4's ecommerce shape, built by `gtmEcommerce()` — which says why that
   * shape — from the same facts the server reports read.
   */
  ecommerce: GtmEcommerce;
  /**
   * The product-row rule our servers apply, stated rather than deciding whether
   * the event is pushed: analytics counts every product, an advertising tag
   * fires only where this is `true`.
   */
  advertised: boolean;
}

/** A marketing page was reached. */
export interface GtmPageViewEvent extends GtmEventBase {
  event: typeof GTM_EVENTS.pageView;
}

/**
 * A product page showed its product: once per product page reached, once the
 * product has been read.
 */
export interface GtmProductViewEvent extends GtmEventBase, GtmProductFields {
  event: typeof GTM_EVENTS.productView;
}

/**
 * The click into the sign-up flow from a product's page — creating an account
 * there while signed out, or the button that enrols — once per product page
 * reached, pushed inside the click while the address bar still shows the page.
 */
export interface GtmCheckoutStartEvent extends GtmEventBase, GtmProductFields {
  event: typeof GTM_EVENTS.checkoutStart;
}

/**
 * A parent account was created. `ecommerce` names the product whose page the
 * sign-up started from when that was an advertised product's page — exactly
 * the product the server's lead names, and unpriced as it is — and is `null`
 * otherwise.
 *
 * No `advertised` here, deliberately: the server reports a lead whatever page
 * it started from, so the browser twin of it has to fire on every `sign_up`,
 * and the product rule has already decided which product, if any, it names.
 */
export interface GtmSignUpEvent extends GtmEventBase {
  event: typeof GTM_EVENTS.accountCreated;
  ecommerce: GtmEcommerce | null;
}

/**
 * A signup attempt ended in something worth reporting.
 *
 * `outcome` is drawn from the same three words the Meta side uses, so a reader
 * comparing the two platforms is not also translating. Meta is sent only two
 * of them: `sent_to_checkout` is pushed here, while Meta's checkout start is
 * the earlier click into the flow. A queue place carries no value, by the rule
 * the server's report applies.
 */
export interface GtmEnrolmentEvent extends GtmEventBase, GtmProductFields {
  event: typeof GTM_EVENTS.enrolment | typeof GTM_EVENTS.checkout;
  outcome: EnrolmentOutcome;
}

export type GtmEvent =
  | GtmPageViewEvent
  | GtmProductViewEvent
  | GtmCheckoutStartEvent
  | GtmSignUpEvent
  | GtmEnrolmentEvent;

/**
 * A product event as a product page hands it over: everything but the id,
 * which is minted at the moment of pushing, and the path, which is filled in
 * from the address the push was authorised on.
 */
export type GtmProductPageEvent =
  | Omit<GtmProductViewEvent, "event_id" | "page_path">
  | Omit<GtmCheckoutStartEvent, "event_id" | "page_path">;

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
