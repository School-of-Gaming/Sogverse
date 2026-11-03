/**
 * What we report to an advertising platform, named once for both sides of the
 * wire: the browser reports every moment through the Tag Manager container's
 * Meta and Reddit tags, our servers report the same moments through each
 * platform's Conversions API, and both have to mean the same thing by the same
 * word.
 *
 * Client-safe and React-free — the components and the route handlers both
 * import it.
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
 *     it is reported at the click, for a free product exactly as for a paid
 *     one — and never as an enrolment, because a name is what Meta optimises
 *     on and an abandoned attempt would train the campaign as hard as a seat.
 *
 *   - `ViewContent` — a product page was looked at.
 *   - `PageView` — a marketing page was reached.
 *
 * **The browser's three moments — the page view, the product view and the
 * checkout start — are reported from both sides under one id.** No handler of
 * ours commits any of them, so the browser decides each: it pushes `page_view`,
 * `view_item` and `add_to_cart` (`@/lib/gtm-events`), and each vendor's tag in
 * the container maps them — Meta's to `PageView`, `ViewContent` and
 * `InitiateCheckout`, Reddit's to `PageVisit`, `ViewContent` and `AddToCart`.
 * Reddit has no event for stepping into a checkout, and the closest standard
 * one is putting a product in the basket, which commits nothing and names one
 * product. The browser then hands the same moment and its id to
 * `/api/page-events`, which re-checks every gate and reports it through each
 * platform's Conversions API under the names below — so a tag whose vendor
 * library a browser blocked still has its event arrive, and one that got
 * through is counted once. The
 * container's names are configured there and the servers' are code; the two
 * must stay the same words.
 *
 * **Reddit gets every event Meta does, under its own names** — the same
 * moments, the same products, the same gates — because Reddit optimises on the
 * name in the same way. Its conversion vocabulary sits beside Meta's below; the
 * mapping is the one decision in it, and each pair is the closest standard
 * event Reddit has to the moment Meta's name describes.
 *
 * The enrolment outcomes travel beside the name as `outcome`, so a report can
 * separate "took a seat" from "joined the queue" without the name having to
 * carry it — fixed labels, spelled one way, in every report. Analytics also
 * hears "went to Stripe" under the same word list; Meta does not, because its
 * checkout start is the click above.
 */

import { z } from "zod";
import {
  DEFAULT_CURRENCY,
  type SupportedCurrency,
} from "@/lib/constants/currency";
import { DEFAULT_LOCALE } from "@/lib/constants/locales";
import { resolveRequiredTranslation } from "@/lib/i18n/resolve-translation";
import type { BillingMode, ProductTopic, ProductType } from "@/types";

/**
 * Meta's names for what our servers report: the two conversions, and the
 * server twins of the browser's page view, product view and checkout start.
 */
export const META_CONVERSION_EVENTS = {
  accountCreated: "Lead",
  enrolment: "CompleteRegistration",
  pageView: "PageView",
  productView: "ViewContent",
  checkoutStart: "InitiateCheckout",
} as const;

/**
 * Reddit's names for what our servers report, as its Conversions API spells a
 * `tracking_type` — upper snake case, unlike the names its browser pixel takes.
 *
 *   - `LEAD` — an account was created, Meta's `Lead`.
 *   - `SIGN_UP` — an enrolment, a seat or a queue place: Reddit's event for
 *     registering through a sign-up form, which reads as registering *for* a
 *     thing exactly as Meta's `CompleteRegistration` does — so it is the
 *     enrolment's name and never the account's.
 *   - `PAGE_VISIT`, `VIEW_CONTENT` and `ADD_TO_CART` — the server twins of the
 *     container tag's `PageVisit`, `ViewContent` and `AddToCart`.
 */
export const REDDIT_CONVERSION_EVENTS = {
  accountCreated: "LEAD",
  enrolment: "SIGN_UP",
  pageView: "PAGE_VISIT",
  productView: "VIEW_CONTENT",
  checkoutStart: "ADD_TO_CART",
} as const;

/** The three ways a signup attempt can end in something worth reporting. */
export const ENROLMENT_OUTCOMES = [
  "enrolled",
  "waitlisted",
  "sent_to_checkout",
] as const;

export type EnrolmentOutcome = (typeof ENROLMENT_OUTCOMES)[number];

/**
 * The outcomes our servers report to the advertising platforms, both as the
 * platform's sign-up conversion. Being handed to Stripe is not one: every
 * platform's checkout start is the browser's click, and a second report of it
 * from here would count every paid attempt twice.
 */
export type ReportedEnrolmentOutcome = Exclude<EnrolmentOutcome, "sent_to_checkout">;

/**
 * The account a server report is about: the one the request acts as — the
 * parent it just registered, or the signed-in customer — and never anyone else.
 * It is always the parent's own address and account id, and never a gamer's or
 * a participant's: the conversion routes are customer-only. The page-event
 * route names no account, whoever is signed in. Either is `null` when the
 * caller has none to hand — an anonymous visitor has neither, and a page event
 * passes neither — and the report still goes, without that field's hash.
 */
export interface ConversionAccount {
  /** The parent's own account id — their auth user, which is their profile. */
  id: string | null;
  email: string | null;
}

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
  content_name: string;
  content_category: ProductTopic;
  value?: number;
  currency?: string;
}

export function metaProductDetails(
  product: ProductFactsSource,
  currency: SupportedCurrency = DEFAULT_CURRENCY,
): MetaProductDetails {
  const facts = productFacts(product, currency);
  return {
    content_ids: [facts.id],
    content_type: "product",
    content_name: facts.name,
    content_category: facts.category,
    ...(facts.price !== undefined && facts.price),
  };
}

/**
 * The same product, in Reddit's event metadata — the shape its pixel's `track`
 * call takes. It states exactly what `metaProductDetails` states, read through
 * the same facts below, so the two platforms can never be told different
 * things about one product: the id, the English name, the topic as the
 * category, and the price with its currency or neither.
 *
 * `itemCount` is one because every event names one product.
 */
export interface RedditProductDetails {
  products: [{ id: string; name: string; category: ProductTopic }];
  itemCount: 1;
  value?: number;
  currency?: string;
}

export function redditProductDetails(
  product: ProductFactsSource,
  currency: SupportedCurrency = DEFAULT_CURRENCY,
): RedditProductDetails {
  const facts = productFacts(product, currency);
  return {
    products: [{ id: facts.id, name: facts.name, category: facts.category }],
    itemCount: 1,
    ...(facts.price !== undefined && facts.price),
  };
}

/**
 * One product in every platform's fields at once — what a server conversion
 * carries, so each platform's report reads its own description and no caller
 * can build one and forget the other.
 */
export interface AdvertisedProductDetails {
  meta: MetaProductDetails;
  reddit: RedditProductDetails;
}

export function advertisedProductDetails(
  product: ProductFactsSource,
  currency: SupportedCurrency = DEFAULT_CURRENCY,
): AdvertisedProductDetails {
  return {
    meta: metaProductDetails(product, currency),
    reddit: redditProductDetails(product, currency),
  };
}

/**
 * The same product as the browser pushes it into `dataLayer`: GA4's ecommerce
 * object, read through the same facts as the two platforms' fields, so a
 * container tag cannot be told anything about a product that Meta's and
 * Reddit's server reports would describe differently.
 *
 * **GA4's shape rather than a flat one of our own**, because it is the shape
 * two of the container's three readers already understand: Google's analytics
 * tag and Reddit's template both read it with no configuration. Meta's
 * template does not, so each product push also carries the same product as
 * `meta`, built from this object (`gtmMetaProduct()`).
 *
 * `priced: false` drops the value, the currency and the item's price together,
 * for the two moments the server reports also leave unpriced — a queue place
 * and an account creation — so the browser's twin of a server report never
 * states a value the server report withholds.
 */
export interface GtmEcommerce {
  items: [
    {
      item_id: string;
      item_name: string;
      item_category: ProductTopic;
      price?: number;
      quantity: 1;
    },
  ];
  value?: number;
  currency?: string;
}

export function gtmEcommerce(
  product: ProductFactsSource,
  { priced, currency = DEFAULT_CURRENCY }: { priced: boolean; currency?: SupportedCurrency },
): GtmEcommerce {
  const facts = productFacts(product, currency);
  const price = priced ? facts.price : undefined;
  return {
    items: [
      {
        item_id: facts.id,
        item_name: facts.name,
        item_category: facts.category,
        ...(price !== undefined && { price: price.value }),
        quantity: 1,
      },
    ],
    ...(price !== undefined && price),
  };
}

/**
 * The product a push names, in the object Meta's gallery template takes whole
 * through its "Load Properties From Variable" field — so its tag is one Data
 * Layer Variable, `meta`, rather than six rows a configurer could get wrong.
 *
 * Read off the push's own `ecommerce`, which `gtmEcommerce()` built from the
 * product's facts, so it states exactly what that states: the id as a
 * one-element `content_ids` list (Meta's field is a list, and a bare string
 * there is what Test Events warns about), the English name, the topic, and the
 * value and currency only where the push is priced.
 *
 * **Reddit gets no object of its own, because its template needs none.** Read
 * from its source (v1.0.4, `useEcommerceProductData`): it takes the products,
 * the item count, the value and the currency straight from GA4's `ecommerce`
 * — `item_id`, `item_name`, `item_category`, `price` and `quantity` — which is
 * the shape every push already carries. Its product fields take only a typed
 * table or a JSON string, so a ready-made list here could not be wired into
 * them anyway.
 */
export function gtmMetaProduct(ecommerce: GtmEcommerce): MetaProductDetails {
  const [item] = ecommerce.items;
  return {
    content_ids: [item.item_id],
    content_type: "product",
    content_name: item.item_name,
    content_category: item.item_category,
    ...(ecommerce.value !== undefined && { value: ecommerce.value }),
    ...(ecommerce.currency !== undefined && { currency: ecommerce.currency }),
  };
}

/** What both platforms' product fields are built from. */
type ProductFactsSource = {
  id: string;
  topic: ProductTopic;
  billing_mode: BillingMode;
  product_translations: readonly { locale: string; name: string }[];
  product_prices: readonly { currency: string; price_cents: number }[];
};

/**
 * The facts every platform is told about a product, decided once. `price` is
 * absent for a paid product with no price in the currency, and then neither
 * the value nor the currency is stated.
 */
function productFacts(
  product: ProductFactsSource,
  currency: SupportedCurrency,
): {
  id: string;
  name: string;
  category: ProductTopic;
  price?: { value: number; currency: string };
} {
  const name = resolveRequiredTranslation(product.product_translations, DEFAULT_LOCALE).name;
  const priceCents =
    product.billing_mode === "free"
      ? 0
      : product.product_prices.find((price) => price.currency === currency)
          ?.price_cents;

  return {
    id: product.id,
    name,
    category: product.topic,
    ...(priceCents !== undefined && {
      price: {
        value: priceCents / 100,
        // ISO 4217, which both platforms read upper-case; ours are stored
        // lower-case because that is how Stripe spells them.
        currency: currency.toUpperCase(),
      },
    }),
  };
}

/**
 * The id one conversion goes by on both sides of the wire, as a request body
 * carries it: the browser mints it, sends it to the route that commits the
 * action, and pushes its own `dataLayer` event under the same id once the route
 * has answered — so a container tag's browser event and our server's report of
 * the same moment reach each platform as one conversion rather than two.
 *
 * **Untrusted, and only ever a deduplication key.** A client can send anything
 * here; the worst a forged id can do is make a platform discard one of that
 * client's own conversions as a duplicate of another. It names no row, is
 * stored nowhere and is never echoed into anything but the platforms'
 * dedup fields. A UUID because that is what our own forms mint, so anything
 * else is a malformed request rather than a value to be lenient with.
 *
 * **Optional**: absent, the server mints one of its own, and its report goes
 * out exactly as it did before the browser had a twin to match.
 */
export const conversionEventIdValue = z.string().uuid().optional();

/**
 * A pixel id is a run of digits and nothing else — Meta's advertiser id.
 *
 * Checked rather than assumed before a server report: an unset variable is the
 * ordinary case (the reports are off), and a variable holding a placeholder
 * like `your-meta-pixel-id` must read as off rather than as a dataset that will
 * 400 on every event.
 */
export function isValidPixelId(id: string | undefined): id is string {
  return id !== undefined && /^\d{1,32}$/.test(id);
}

/**
 * A Reddit pixel id is `a2_` (an advertiser account) or `t2_` (a user
 * account) and a short run of letters and digits — Reddit's own shape, which
 * Meta's digits-only check would refuse.
 *
 * Checked rather than assumed for the same reasons as Meta's: unset is the
 * ordinary case and means the reports are off, and a placeholder like
 * `your-reddit-pixel-id` must read as off rather than as a pixel.
 */
export function isValidRedditPixelId(id: string | undefined): id is string {
  return id !== undefined && /^(a2|t2)_[a-z0-9]{1,32}$/i.test(id);
}
