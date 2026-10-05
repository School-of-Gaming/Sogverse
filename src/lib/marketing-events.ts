/**
 * What we report to an advertising platform, named once for both sides of the
 * wire: the browser reports the page and product views and the start of a
 * checkout, our servers report the conversions, and both have to mean the same
 * thing by the same word.
 *
 * Client-safe and React-free — the component and the route handlers both import
 * it.
 *
 * **Meta optimises a campaign on the event *name*.** That is the whole reason
 * this is a vocabulary rather than string literals at their call sites: the
 * platform learns "find more people who do *this*", so the name decides what it
 * goes looking for, and a name used loosely trains it on the wrong thing.
 *
 *   - `Lead` — someone reachable who has committed to nothing: an account
 *     exists, and that is all. Reported when a parent registers.
 *   - `CompleteRegistration` — registering *for* something: a seat on a product
 *     or a place in its queue. The word in Meta's taxonomy is about signing up
 *     for a thing, not about creating a login, which is why account creation is
 *     the `Lead` above and not this.
 *   - `InitiateCheckout` — the parent has stepped into the sign-up flow from a
 *     product's page: clicked to create an account there, or clicked the button
 *     that enrols. It is the top of the flow and commits nothing, which is why
 *     it is reported from the browser at the click, for a free product exactly
 *     as for a paid one — and never as an enrolment, because a name is what
 *     Meta optimises on and an abandoned attempt would train the campaign as
 *     hard as a seat.
 *
 *   - `ViewContent` — a product page was looked at. Reported from the browser,
 *     because a view commits nothing and no handler of ours sees it happen.
 *
 * The enrolment outcomes travel beside the name as `outcome`, so a report can
 * separate "took a seat" from "joined the queue" without the name having to
 * carry it — fixed labels, spelled one way, in every report. Analytics also
 * hears "went to Stripe" under the same word list; Meta does not, because its
 * checkout start is the click above.
 */

import {
  DEFAULT_CURRENCY,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { BillingMode, ProductTopic, ProductType } from "@/types";

export const PIXEL_EVENTS = {
  pageView: "PageView",
  productView: "ViewContent",
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

/**
 * The outcomes our servers report to Meta, both as `CompleteRegistration`.
 * Being handed to Stripe is not one: Meta's checkout start is the browser's
 * click, and a second report of it from here would count every paid attempt
 * twice.
 */
export type MetaEnrolmentOutcome = Exclude<EnrolmentOutcome, "sent_to_checkout">;

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
 * Which product an event is about, in Meta's standard product fields — the
 * one shape the browser's product view and checkout start and the servers'
 * enrolment reports all send, so a campaign reads the same product the same
 * way at every step.
 *
 * Every value is a fact about the product and none is about a person, and
 * none varies with who is looking:
 *
 *   - `content_name` is the English name, whatever the visitor's locale — one
 *     product is one name in a report, not one per language it was bought in.
 *   - `content_category` is the topic, the game or discipline the product
 *     teaches (`roblox_studio`). It is the classifier a campaign is run per,
 *     and an enum value rather than copy, so no rename ever moves it.
 *   - `value` is the price the family pays — per month for a club, once for
 *     anything else — and zero for a free product. A paid product with no price
 *     in the currency states neither `value` nor `currency`: a guessed price is
 *     worse than none, because the platform would optimise towards it.
 */
export interface MetaProductDetails {
  content_ids: [string];
  content_type: "product";
  content_name?: string;
  content_category: ProductTopic;
  value?: number;
  currency?: string;
}

export function metaProductDetails(
  product: {
    id: string;
    topic: ProductTopic;
    billing_mode: BillingMode;
    product_translations: readonly { locale: string; name: string }[];
    product_prices: readonly { currency: string; price_cents: number }[];
  },
  currency: SupportedCurrency = DEFAULT_CURRENCY,
): MetaProductDetails {
  const name = resolveTranslation(
    inLocaleOrder(product.product_translations),
    DEFAULT_LOCALE,
  )?.name;
  const priceCents =
    product.billing_mode === "free"
      ? 0
      : product.product_prices.find((price) => price.currency === currency)
          ?.price_cents;

  return {
    content_ids: [product.id],
    content_type: "product",
    ...(name !== undefined && { content_name: name }),
    content_category: product.topic,
    ...(priceCents !== undefined && {
      value: priceCents / 100,
      // ISO 4217, which Meta reads upper-case; ours are stored lower-case
      // because that is how Stripe spells them.
      currency: currency.toUpperCase(),
    }),
  };
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
