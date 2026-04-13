import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  detectLanguageFromHeader,
  isSupportedLanguage,
  DEFAULT_LANGUAGE,
  DEFAULT_TIMEZONE,
  type SupportedLanguage,
} from "@/lib/constants/language-preference";
import { loadMessages } from "./messages";

export default getRequestConfig(async () => {
  // Priority: cookie > Accept-Language header > default
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("language")?.value;

  let locale: SupportedLanguage = DEFAULT_LANGUAGE;

  if (cookieLocale && isSupportedLanguage(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const headersList = await headers();
    locale = detectLanguageFromHeader(headersList.get("accept-language"));
  }

  return {
    locale,
    timeZone: DEFAULT_TIMEZONE,
    messages: await loadMessages(locale),
  };
});
