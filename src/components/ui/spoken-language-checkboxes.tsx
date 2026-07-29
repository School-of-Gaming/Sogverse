"use client";

/**
 * Controls for the user's **spoken languages** — the human languages they
 * speak / want clubs delivered in. Backed by the `profiles.spoken_languages`
 * array (for users), the `products.spoken_language_code` column (for clubs),
 * and the `spoken_languages` reference table.
 *
 * **Not the UI locale picker** (which translation of the app the user sees).
 * For that, see src/components/layout/locale-picker.tsx and the LocaleProvider.
 * See src/i18n/CLAUDE.md for the convention split between locale and
 * spoken language.
 *
 * Exports SpokenLanguageCheckboxes — multi-select, for user profile / settings.
 * Callers server-prefetch the reference set and pass it as `initialData` to
 * `useSpokenLanguages`, so the checkboxes paint complete on the first frame and
 * this component never needs a loading/placeholder state.
 */

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { SpokenLanguage } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getSpokenLanguageFlag,
  type SpokenLanguageFlag,
} from "@/components/ui/language-flag";
import { resolveLocale } from "@/lib/constants/locales";

// Language names render in the viewer's locale. The `spoken_languages`
// reference table carries a single (English) `name`, so localizing it there
// would need a translation table; `Intl.DisplayNames` names any language code
// in any locale for free ("fi" → Finnish / suomi / finska), and it covers every
// code the table may ever grow — where the hand-maintained map of `common.*`
// keys this replaced silently fell back to English for anything new.
function useLangDisplay() {
  const uiLocale = resolveLocale(useLocale());
  const languageNames = useMemo(() => {
    try {
      return new Intl.DisplayNames([uiLocale], { type: "language" });
    } catch {
      return null;
    }
  }, [uiLocale]);

  return (lang: SpokenLanguage): { FlagIcon: SpokenLanguageFlag | undefined; displayName: string } => {
    const FlagIcon = getSpokenLanguageFlag(lang.code);
    // The DB `name` is the fallback for a code Intl cannot resolve.
    const displayName = languageNames?.of(lang.code) ?? lang.name;
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

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{t("spokenLanguages")}</legend>
      <div className="flex flex-col gap-2">
        {spokenLanguages.map((lang) => {
          const { FlagIcon, displayName } = display(lang);
          return (
            <label key={lang.code} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={selected.includes(lang.code)}
                onChange={(e) => {
                  onChange(
                    e.target.checked
                      ? [...selected, lang.code]
                      : selected.filter((l) => l !== lang.code),
                  );
                }}
                disabled={disabled}
              />
              <FlagLabel FlagIcon={FlagIcon} displayName={displayName} />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
