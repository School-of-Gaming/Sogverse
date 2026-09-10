import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  detectLocaleFromHeader,
  isSupportedLocale,
  DEFAULT_TIMEZONE,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { LOCALE_COOKIE_NAME } from "@/lib/locale-cookie";
import { loadMessages } from "./messages";

/**
 * The per-request locale, and the messages for it.
 *
 * **The URL wins.** `requestLocale` is the `[locale]` segment of the URL being
 * rendered, so a prefixed request renders in the prefixed locale regardless of
 * cookie, profile or `Accept-Language` — that property is what makes a link
 * shareable and a social card crawlable.
 *
 * The cookie → header ladder below is the fallback for the contexts that have
 * no URL locale at all: the root not-found (a URL matching no locale segment)
 * and anything else rendered outside the `[locale]` tree. It is the same ladder
 * the proxy runs on a bare path, so the two agree.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const urlLocale = await requestLocale;

  let locale: SupportedLocale;
  if (isSupportedLocale(urlLocale)) {
    locale = urlLocale;
  } else {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
    if (isSupportedLocale(cookieLocale)) {
      locale = cookieLocale;
    } else {
      const headersList = await headers();
      locale = detectLocaleFromHeader(headersList.get("accept-language"));
    }
  }

  return {
    locale,
    timeZone: DEFAULT_TIMEZONE,
    messages: await loadMessages(locale),
  };
});
