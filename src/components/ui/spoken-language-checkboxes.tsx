"use client";

/**
 * Controls for the user's **spoken languages** — the human languages they
 * speak / want clubs delivered in. Backed by the `profiles.spoken_languages`
 * array (for users) and the `products.spoken_language_code` column (for clubs),
 * both of which carry the `spoken_language` enum.
 *
 * **Not the UI locale picker** (which translation of the app the user sees).
 * For that, see src/components/layout/locale-picker.tsx and the LocaleProvider.
 * See src/i18n/CLAUDE.md for the convention split between locale and
 * spoken language.
 *
 * Exports SpokenLanguageCheckboxes — multi-select, for user profile / settings.
 * It takes no options prop: the vocabulary is a compile-time constant since
 * 00199, so every box is on screen in the first frame with no query behind it
 * and no loading state to design.
 */

import { useTranslations } from "next-intl";
import { SPOKEN_LANGUAGES, type SpokenLanguageCode } from "@/lib/constants/spoken-languages";
import { Checkbox } from "@/components/ui/checkbox";
import {
  getSpokenLanguageFlag,
  type SpokenLanguageFlag,
} from "@/components/ui/language-flag";
import { useLanguageNames } from "@/hooks/use-language-names";

function FlagLabel({
  FlagIcon,
  displayName,
}: {
  FlagIcon: SpokenLanguageFlag;
  displayName: string;
}) {
  return (
    <>
      <span className="h-4 w-6 [&>svg]:h-full">
        <FlagIcon title={displayName} />
      </span>
      {displayName}
    </>
  );
}

export function SpokenLanguageCheckboxes({
  selected,
  onChange,
  disabled,
}: {
  selected: SpokenLanguageCode[];
  onChange: (selected: SpokenLanguageCode[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("settings");
  // Names render in the viewer's own locale — never stored, never English by
  // default.
  const languageName = useLanguageNames();

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none">{t("spokenLanguages")}</legend>
      <div className="flex flex-col gap-2">
        {SPOKEN_LANGUAGES.map((code) => {
          const displayName = languageName(code);
          return (
            <label key={code} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={selected.includes(code)}
                onChange={(e) => {
                  onChange(
                    e.target.checked
                      ? [...selected, code]
                      : selected.filter((l) => l !== code),
                  );
                }}
                disabled={disabled}
              />
              <FlagLabel
                FlagIcon={getSpokenLanguageFlag(code)}
                displayName={displayName}
              />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
