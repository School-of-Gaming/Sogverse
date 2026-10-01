import { formatInTimeZone } from "date-fns-tz";
import {
  resolveProductPrice,
  statesAPrice,
} from "@/components/public/products/format-product-price";
import { CURRENCY_CONFIG, DEFAULT_CURRENCY } from "@/lib/constants/currency";
import type { SupportedLocale } from "@/lib/constants/locales";
import { inLocaleOrder } from "@/lib/i18n/locale-order";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { formatProductLocation } from "@/lib/products/format-product-location";
import { dateTimeInstant } from "@/lib/schedule-occurrence";
import { organizationId } from "@/lib/seo/organization";
import type { ProductDetailRow } from "@/services/products/products.service";

/*
 * **A listed product's page as schema.org structured data** — emitted only on
 * a product page that is promoted (`docs/architecture/site-quality.md`), and
 * built from the same detail row the visible page renders, so it states only
 * what the page shows.
 *
 * The type follows what the row actually holds:
 *
 * - **A camp or an event is an `Event`** — the shape of Google's event rich
 *   result, whose required fields are a name, a start date and a location
 *   (a `Place` with a name and a `PostalAddress`). Dates are what the page
 *   shows: a camp's range is a calendar range and is stated as dates; an event
 *   with a time slot is an instant, stated with the product timezone's offset,
 *   ending its slot's duration later. An online product's location is its own
 *   page. An in-person one's `Place` is the site the page names, and its
 *   address is the municipality the page names beside it: the site's street
 *   address is staff data the public page never shows, so it is not asserted
 *   here, and Google may count that address as incomplete.
 * - **A club is a `Course` with one `CourseInstance`.** A club is a term of
 *   weekly sessions, and that is what a course instance with a weekly
 *   `courseSchedule` says: each schedule slot becomes a `Schedule` repeating
 *   `Weekly` on its weekday, at its wall-clock start time in the product's own
 *   timezone, for its duration, between the term's dates — and, for a term
 *   with an end date, `repeatCount` times: the number of that weekday the
 *   stated term holds. An open-ended club states no count, because none
 *   exists. Google stopped showing its Course info rich result in 2025, so
 *   this block is for every other schema.org consumer; it still carries the
 *   fields that result read (a description, the provider, an offer with its
 *   category, the course mode and schedule). **A club whose page shows no
 *   short description emits no Course at all**: a `Course` without a
 *   description is the one gap no honest value fills.
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
 * info result read; a club's monthly price says so with a one-month
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

const DAY_MS = 86_400_000;

/**
 * How many times a weekday falls between two calendar dates, both inclusive —
 * the sessions a weekly slot holds across a term. The dates are bare calendar
 * dates, so the walk is UTC-pinned day arithmetic, which is exact.
 */
export function weekdayOccurrences(
  startDate: string,
  endDate: string,
  weekday: number,
): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  const startIso = new Date(start).getUTCDay(); // 0=Sun..6=Sat
  const startWeekday = startIso === 0 ? 6 : startIso - 1; // → 0=Mon..6=Sun
  const first = start + ((weekday - startWeekday + 7) % 7) * DAY_MS;
  return first > end ? 0 : Math.floor((end - first) / (7 * DAY_MS)) + 1;
}


/** An instant as ISO-8601 with the product timezone's own offset. */
function zonedIso(instant: Date, timeZone: string): string {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

/**
 * The dates an `Event` states, as the page shows them: an event with a time
 * slot is an instant and ends its slot's duration later; anything else — a
 * camp's range, an event with no time — is calendar dates.
 */
function eventDatesOf(product: ProductJsonLdSubject) {
  const slot = product.schedule_slots.at(0);
  if (product.product_type === "event" && slot !== undefined) {
    const start = dateTimeInstant(product.start_date, slot.start_time, product.timezone);
    const end = new Date(start.getTime() + slot.duration_minutes * 60_000);
    return {
      startDate: zonedIso(start, product.timezone),
      endDate: zonedIso(end, product.timezone),
    };
  }
  return {
    startDate: product.start_date,
    ...(product.end_date !== null && { endDate: product.end_date }),
  };
}

export function productJsonLd({
  siteUrl,
  canonicalPath,
  product,
  locale,
}: ProductJsonLdInput) {
  const url = `${siteUrl}${canonicalPath}`;
  const shown = resolveTranslation(
    inLocaleOrder(product.product_translations),
    locale,
  );
  const description = shown?.short_description ?? "";
  const image = catalogueImageSrc("product", product.image_path);
  const offer = offerOf(product, url);
  const audience = audienceOf(product);
  const place = product.is_remote ? null : placeOf(product, locale);
  const provider = {
    "@type": "Organization",
    "@id": organizationId(siteUrl),
    name: "School of Gaming",
    url: siteUrl,
  };

  const common = {
    "@context": "https://schema.org",
    name: shown?.name ?? "",
    ...(description !== "" && { description }),
    url,
    ...(image !== null && { image }),
    inLanguage: product.spoken_language_code,
    ...(audience !== null && { audience }),
    ...(offer !== null && { offers: offer }),
  };

  if (product.product_type === "consumer_club" || product.product_type === "municipality_club") {
    // A Course needs a description, and the page shows none to state.
    if (description === "") return null;
    const endDate = product.end_date;
    const courseSchedule = product.schedule_slots.map((slot) => ({
      "@type": "Schedule",
      repeatFrequency: "Weekly",
      ...(endDate !== null && {
        repeatCount: weekdayOccurrences(product.start_date, endDate, slot.weekday),
      }),
      byDay: SCHEMA_WEEKDAYS[slot.weekday],
      startTime: slot.start_time,
      duration: `PT${slot.duration_minutes}M`,
      startDate: product.start_date,
      ...(endDate !== null && { endDate }),
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
    ...eventDatesOf(product),
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
