import { createTranslator } from "use-intl/core";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/lib/constants/locales";
import { loadMessages, type Messages } from "@/i18n/messages";

/**
 * The translator the feed route writes its fixed words with.
 *
 * Same shape as the email translator, and for the same reason: this is copy
 * that **leaves the app**. It is rendered by somebody's calendar client, in the
 * locale of the parent who subscribed, outside React entirely — so it needs a
 * plain-string translator built on `use-intl/core` rather than a hook.
 *
 * Two namespaces rather than one, because the feed's own words and the
 * product-type nouns are different vocabularies with different owners: "Club",
 * "Camp" and "Event" are already named in `productType` and are the same nouns
 * the shop and the dashboards use, so a second copy under `calendarFeed` would
 * be a second place for a family to be told two different words for one thing.
 */
export interface CalendarFeedTranslator {
  /** The feed's own fixed words — the "Online" location, the detail lines. */
  feed: ReturnType<typeof createTranslator<Messages, "calendarFeed">>;
  /** The product-type nouns, shared with every other surface that names one. */
  productType: ReturnType<typeof createTranslator<Messages, "productType">>;
}

export async function getCalendarFeedTranslator(
  locale: SupportedLocale = DEFAULT_LOCALE,
): Promise<CalendarFeedTranslator> {
  const messages = await loadMessages(locale);
  return {
    feed: createTranslator({ locale, messages, namespace: "calendarFeed" }),
    productType: createTranslator({ locale, messages, namespace: "productType" }),
  };
}
