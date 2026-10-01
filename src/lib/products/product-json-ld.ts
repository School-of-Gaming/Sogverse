import {
  resolveProductPrice,
  statesAPrice,
} from "@/components/public/products/format-product-price";
import { CURRENCY_CONFIG, DEFAULT_CURRENCY } from "@/lib/constants/currency";
import type { SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { formatProductLocation } from "@/lib/products/format-product-location";
import { organizationId } from "@/lib/seo/organization";
import type { ProductDetailRow } from "@/services/products/products.service";

/*
 * **A listed product's page as schema.org structured data** — emitted only on
 * a product page that is promoted (`docs/architecture/discoverability.md`), and
 * built from the same detail row the visible page renders, so it can never
 * assert something the page does not show.
 *
 * The type follows what the row actually holds:
 *
 * - **A club is a `Course` with one `CourseInstance`.** A club is a term of
 *   weekly sessions, and that is what a course instance with a weekly
 *   `courseSchedule` says: each schedule slot becomes a `Schedule` repeating
 *   every week (`P1W`) on its weekday, at its wall-clock start time in the
 *   product's own timezone, for its duration, between the term's dates. The
 *   instance's `courseMode` is online or onsite, and an onsite one names its
 *   place. This is the shape Google's Course info rich result reads.
 * - **A camp or an event is an `Event`**: it happens on dates, which is what
 *   an `Event` is, and online or at a place. Dates are stated as dates — a
 *   camp's range is a calendar range and the page shows it as one. This is the
 *   shape Google's event experience reads.
 *
 * Both name School of Gaming by the `@id` of the layout's `Organization` (as
 * the course's `provider` or the event's `organizer`), so a consumer joins the
 * two rather than meeting a second, thinner company.
 *
 * **What is deliberately absent:** seats left, registration state and
 * availability. They are live — they change with every signup and with the
 * clock — and a stale "available" in a search result is worse than none. The
 * price is stated because the page states it, and it changes only when an
 * admin edits the product.
 *
 * `inLanguage` is the language the product is delivered in — the page's
 * Language fact — not the language of the words on the page: for a parent
 * choosing a club, the language a Gedu speaks in the sessions is the one that
 * matters.
 */

/** The columns of the detail row this reads. */
export type ProductJsonLdSubject = Pick<
  ProductDetailRow,
  | "product_type"
  | "billing_mode"
  | "product_translations"
  | "product_prices"
  | "schedule_slots"
  | "locations"
  | "is_remote"
  | "for_gamers"
  | "min_age"
  | "max_age"
  | "start_date"
  | "end_date"
  | "timezone"
  | "image_path"
  | "spoken_language_code"
>;

export interface ProductJsonLdInput {
  /** The canonical site origin — `NEXT_PUBLIC_SITE_URL`. */
  siteUrl: string;
  /** The page's canonical path. */
  canonicalPath: string;
  product: ProductJsonLdSubject;
  /** The locale the page is read at. */
  locale: SupportedLocale;
}

/** schema.org's day-of-week values, Monday first — the schedule slots' 0..6. */
const SCHEMA_WEEKDAYS = [
  "https://schema.org/Monday",
  "https://schema.org/Tuesday",
  "https://schema.org/Wednesday",
  "https://schema.org/Thursday",
  "https://schema.org/Friday",
  "https://schema.org/Saturday",
  "https://schema.org/Sunday",
] as const;

/** Cents as the decimal string schema.org's `price` takes. */
function priceText(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * The offer the page's price panel states, or nothing when it states none (a
 * product with no price in the site's currency, or one billed outside the
 * platform). `category` is the free/paid/subscription word Google's Course
 * info result asks for; a club's monthly price says so with a one-month
 * billing duration.
 */
function offerOf(product: ProductJsonLdSubject, url: string) {
  if (!statesAPrice(product)) return null;
  const resolved = resolveProductPrice({
    prices: product.product_prices,
    billingMode: product.billing_mode,
    productType: product.product_type,
    currency: DEFAULT_CURRENCY,
  });
  const priceCurrency = CURRENCY_CONFIG[DEFAULT_CURRENCY].label;
  switch (resolved.kind) {
    case "unavailable":
      return null;
    case "free":
      return { "@type": "Offer", url, price: "0", priceCurrency, category: "Free" };
    case "upfront":
      return {
        "@type": "Offer",
        url,
        price: priceText(resolved.priceCents),
        priceCurrency,
        category: "Paid",
      };
    case "subscription":
      return {
        "@type": "Offer",
        url,
        price: priceText(resolved.priceCents),
        priceCurrency,
        category: "Subscription",
        priceSpecification: {
          "@type": "UnitPriceSpecification",
          price: priceText(resolved.priceCents),
          priceCurrency,
          billingDuration: "P1M",
        },
      };
  }
}

/** The age range the page states, when it states one. */
function audienceOf(product: ProductJsonLdSubject) {
  if (product.min_age === null || product.max_age === null) return null;
  return {
    "@type": "PeopleAudience",
    suggestedMinAge: product.min_age,
    suggestedMaxAge: product.max_age,
  };
}

/** The place an in-person product happens at, named as the page names it. */
function placeOf(product: ProductJsonLdSubject, locale: SupportedLocale) {
  const location = formatProductLocation(product, locale);
  if (location?.kind !== "site") return null;
  return {
    "@type": "Place",
    name: location.site,
    ...(location.parent !== null && {
      address: { "@type": "PostalAddress", addressLocality: location.parent },
    }),
  };
}

export function productJsonLd({
  siteUrl,
  canonicalPath,
  product,
  locale,
}: ProductJsonLdInput) {
  const url = `${siteUrl}${canonicalPath}`;
  const shown = resolveTranslation(product.product_translations, locale);
  const image = catalogueImageSrc("product", product.image_path);
  const offer = offerOf(product, url);
  const audience = audienceOf(product);
  const place = product.is_remote ? null : placeOf(product, locale);
  const provider = {
    "@type": "Organization",
    "@id": organizationId(siteUrl),
    name: "School of Gaming",
  };

  const common = {
    "@context": "https://schema.org",
    name: shown?.name ?? "",
    ...(shown !== null &&
      shown.short_description !== "" && { description: shown.short_description }),
    url,
    ...(image !== null && { image }),
    inLanguage: product.spoken_language_code,
    ...(audience !== null && { audience }),
    ...(offer !== null && { offers: offer }),
  };

  if (product.product_type === "consumer_club" || product.product_type === "municipality_club") {
    const courseSchedule = product.schedule_slots.map((slot) => ({
      "@type": "Schedule",
      repeatFrequency: "P1W",
      byDay: SCHEMA_WEEKDAYS[slot.weekday],
      startTime: slot.start_time,
      duration: `PT${slot.duration_minutes}M`,
      startDate: product.start_date,
      ...(product.end_date !== null && { endDate: product.end_date }),
      scheduleTimezone: product.timezone,
    }));
    return {
      ...common,
      "@type": "Course",
      provider,
      hasCourseInstance: {
        "@type": "CourseInstance",
        courseMode: product.is_remote ? "Online" : "Onsite",
        ...(place !== null && { location: place }),
        ...(courseSchedule.length > 0 && { courseSchedule }),
      },
    };
  }

  return {
    ...common,
    "@type": "Event",
    startDate: product.start_date,
    ...(product.end_date !== null && { endDate: product.end_date }),
    eventAttendanceMode: product.is_remote
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    // An online product's place is its page; an in-person one names its site,
    // which the database requires it to have.
    ...(product.is_remote
      ? { location: { "@type": "VirtualLocation", url } }
      : place !== null && { location: place }),
    organizer: provider,
  };
}
