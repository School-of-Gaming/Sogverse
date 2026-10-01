import {
  DEFAULT_LOCALE,
  LOCALE_CONFIG,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { SPOKEN_LANGUAGES } from "@/lib/constants/spoken-languages";
import {
  languageDisplayName,
  languageDisplayNames,
} from "@/lib/i18n/language-name";

/**
 * Every spoken language our clubs are delivered in, as one phrase in the
 * reader's locale: "Finnish, Swedish, English and French", "suomi, ruotsi,
 * englanti ja ranska".
 *
 * **The list is never written into copy.** It grows as we expand, so a
 * sentence that states it takes a `{languages}` placeholder and this fills it
 * from `SPOKEN_LANGUAGES`, in the enum's order. Each name is resolved the one
 * sanctioned way (`@/lib/i18n/language-name`), lowercase mid-sentence in
 * Finnish, Swedish and French as those languages write them, and the list is
 * joined by `Intl.ListFormat`.
 *
 * The join is formatted with the locale's country, because it is regional:
 * plain `en` puts a comma before "and", and the site's English is UK English,
 * which does not. Klingon has no `Intl` data and its "country" is not a region
 * tag, so a Klingon reader gets the default locale's join — the names already
 * fall back to English for that locale.
 */
export function spokenLanguagesPhrase(locale: SupportedLocale): string {
  const joinLocale = locale === "tlh" ? DEFAULT_LOCALE : locale;
  const join = new Intl.ListFormat(
    [`${joinLocale}-${LOCALE_CONFIG[joinLocale].country}`],
    { type: "conjunction" },
  );
  const displayNames = languageDisplayNames(locale);

  return join.format(
    SPOKEN_LANGUAGES.map((code) => languageDisplayName(displayNames, code)),
  );
}
