"use client";

/**
 * Multi-select for the user's **spoken languages** — the human languages they
 * speak / want clubs delivered in. Backed by the `profiles.spoken_languages`
 * array and the `spoken_languages` reference table; used when matching
 * gamers/gedus to clubs.
 *
 * **Not the UI locale picker** (which translation of the app the user sees).
 * For that, see src/components/layout/locale-picker.tsx and the LocaleProvider.
 * See docs/i18n-architecture.md for the convention split between locale and
 * spoken language.
 */

import flags from "react-phone-number-input/flags";
import { useTranslations } from "next-intl";
import type { SpokenLanguage } from "@/types";

// Map spoken-language codes to country codes for flag display.
// Update when adding new languages to the spoken_languages table.
const LANG_TO_COUNTRY: Record<string, string> = {
  fi: "FI",
  sv: "SE",
  en: "GB",
};

// Map spoken-language codes to common.* translation keys.
// Falls back to the DB name for codes not listed here.
const LANG_NAME_KEYS: Record<string, string> = {
  en: "languageEnglish",
  fi: "languageFinnish",
  sv: "languageSwedish",
};

const PLACEHOLDER_COUNT = 3;

export function SpokenLanguageCheckboxes({
  languages,
  selected,
  onChange,
  disabled,
}: {
  languages: SpokenLanguage[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('settings');
  const c = useTranslations('common');
  const loaded = languages.length > 0;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{t('languages')}</legend>
      <div className="flex flex-col gap-2">
        {loaded
          ? languages.map((lang) => {
              const country = LANG_TO_COUNTRY[lang.code];
              const FlagIcon = country ? flags[country as keyof typeof flags] : undefined;
              const nameKey = LANG_NAME_KEYS[lang.code];
              const displayName = nameKey ? c(nameKey as "languageEnglish") : lang.name;
              return (
                <label key={lang.code} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(lang.code)}
                    onChange={(e) => {
                      onChange(
                        e.target.checked
                          ? [...selected, lang.code]
                          : selected.filter((l) => l !== lang.code)
                      );
                    }}
                    disabled={disabled}
                    className="h-4 w-4 accent-primary cursor-pointer"
                  />
                  {FlagIcon && <span className="h-4 w-6 [&>svg]:h-full"><FlagIcon title={displayName} /></span>}
                  {displayName}
                </label>
              );
            })
          : Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
              <label key={i} className="invisible flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4" />
                &nbsp;
              </label>
            ))}
      </div>
    </fieldset>
  );
}
