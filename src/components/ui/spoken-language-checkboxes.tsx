"use client";

/**
 * Controls for the user's **spoken languages** — the human languages they
 * speak / want clubs delivered in. Backed by the `profiles.spoken_languages`
 * array (for users), the `products.spoken_language_code` column (for clubs),
 * and the `spoken_languages` reference table.
 *
 * **Not the UI locale picker** (which translation of the app the user sees).
 * For that, see src/components/layout/locale-picker.tsx and the LocaleProvider.
 * See docs/i18n-architecture.md for the convention split between locale and
 * spoken language.
 *
 * Exports:
 *   - SpokenLanguageCheckboxes — multi-select, for user profile / settings
 *   - SpokenLanguageRadioGroup — single-select, for product admin form
 *
 * Both components share the same flag/translation helpers, so adding a new
 * language to the DB shows up in both automatically.
 */

import { useTranslations } from "next-intl";
import type { SpokenLanguage } from "@/types";
import {
  getSpokenLanguageFlag,
  type SpokenLanguageFlag,
} from "@/components/ui/language-flag";

// Map spoken-language codes to common.* translation keys.
// Falls back to the DB name for codes not listed here.
const SPOKEN_LANG_NAME_KEYS: Record<string, string> = {
  en: "languageEnglish",
  fi: "languageFinnish",
  sv: "languageSwedish",
};

const PLACEHOLDER_COUNT = 3;

function useLangDisplay() {
  const c = useTranslations("common");
  return (lang: SpokenLanguage): { FlagIcon: SpokenLanguageFlag | undefined; displayName: string } => {
    const FlagIcon = getSpokenLanguageFlag(lang.code);
    const nameKey = SPOKEN_LANG_NAME_KEYS[lang.code];
    const displayName = nameKey ? c(nameKey as "languageEnglish") : lang.name;
    return { FlagIcon, displayName };
  };
}

function FlagLabel({
  FlagIcon,
  displayName,
}: {
  FlagIcon: SpokenLanguageFlag | undefined;
  displayName: string;
}) {
  return (
    <>
      {FlagIcon && (
        <span className="h-4 w-6 [&>svg]:h-full">
          <FlagIcon title={displayName} />
        </span>
      )}
      {displayName}
    </>
  );
}

export function SpokenLanguageCheckboxes({
  spokenLanguages,
  selected,
  onChange,
  disabled,
}: {
  spokenLanguages: SpokenLanguage[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("settings");
  const display = useLangDisplay();
  const loaded = spokenLanguages.length > 0;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{t("spokenLanguages")}</legend>
      <div className="flex flex-col gap-2">
        {loaded
          ? spokenLanguages.map((lang) => {
              const { FlagIcon, displayName } = display(lang);
              return (
                <label key={lang.code} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(lang.code)}
                    onChange={(e) => {
                      onChange(
                        e.target.checked
                          ? [...selected, lang.code]
                          : selected.filter((l) => l !== lang.code),
                      );
                    }}
                    disabled={disabled}
                    className="h-4 w-4 accent-primary cursor-pointer"
                  />
                  <FlagLabel FlagIcon={FlagIcon} displayName={displayName} />
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

/**
 * Single-select variant for the product admin form. A club is delivered in
 * exactly one language, so radios are the right affordance (not checkboxes
 * with max=1).
 */
export function SpokenLanguageRadioGroup({
  spokenLanguages,
  selected,
  onChange,
  disabled,
  name = "spoken-language",
}: {
  spokenLanguages: SpokenLanguage[];
  selected: string | null;
  onChange: (code: string) => void;
  disabled?: boolean;
  name?: string;
}) {
  const display = useLangDisplay();
  const loaded = spokenLanguages.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {loaded
        ? spokenLanguages.map((lang) => {
            const { FlagIcon, displayName } = display(lang);
            return (
              <label key={lang.code} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  name={name}
                  value={lang.code}
                  checked={selected === lang.code}
                  onChange={() => onChange(lang.code)}
                  disabled={disabled}
                  className="h-4 w-4 accent-primary cursor-pointer"
                />
                <FlagLabel FlagIcon={FlagIcon} displayName={displayName} />
              </label>
            );
          })
        : Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
            <label key={i} className="invisible flex items-center gap-2 text-sm">
              <input type="radio" className="h-4 w-4" />
              &nbsp;
            </label>
          ))}
    </div>
  );
}
