"use client";

import flags from "react-phone-number-input/flags";
import { useTranslations } from "next-intl";
import type { LanguageRow } from "@/types";

// Map language codes to country codes for flag display.
// Update when adding new languages to the DB.
const LANG_TO_COUNTRY: Record<string, string> = {
  fi: "FI",
  sv: "SE",
  en: "GB",
};

const PLACEHOLDER_COUNT = 3;

export function LanguageCheckboxes({
  languages,
  selected,
  onChange,
  disabled,
}: {
  languages: LanguageRow[];
  selected: string[];
  onChange: (selected: string[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('settings');
  const loaded = languages.length > 0;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{t('languages')}</legend>
      <div className="flex flex-col gap-2">
        {loaded
          ? languages.map((lang) => {
              const country = LANG_TO_COUNTRY[lang.code];
              const FlagIcon = country ? flags[country as keyof typeof flags] : undefined;
              return (
                <label key={lang.code} className="flex items-center gap-2 text-sm">
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
                    className="h-4 w-4 accent-primary"
                  />
                  {FlagIcon && <span className="h-4 w-6 [&>svg]:h-full"><FlagIcon title={lang.name} /></span>}
                  {lang.name}
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
