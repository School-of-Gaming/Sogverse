import {
  formattingLocale,
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
 */
export function spokenLanguagesPhrase(locale: SupportedLocale): string {
  const join = new Intl.ListFormat(formattingLocale(locale), {
    type: "conjunction",
  });
  const displayNames = languageDisplayNames(locale);

  return join.format(
    SPOKEN_LANGUAGES.map((code) => languageDisplayName(displayNames, code)),
  );
}
