import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  detectLocaleFromHeader,
  isSupportedLocale,
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { loadMessages } from "./messages";

export default getRequestConfig(async () => {
  // Priority: cookie > Accept-Language header > default
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;

  let locale: SupportedLocale = DEFAULT_LOCALE;

  if (cookieLocale && isSupportedLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const headersList = await headers();
    locale = detectLocaleFromHeader(headersList.get("accept-language"));
  }

  return {
    locale,
    timeZone: DEFAULT_TIMEZONE,
    messages: await loadMessages(locale),
  };
});
