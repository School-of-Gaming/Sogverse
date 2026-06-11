"use client";

import flags from "react-phone-number-input/flags";
import { cn, isKeyOf } from "@/lib/utils";

// Spoken-language → country code mapping for flag display. Update when
// adding new languages to the `spoken_languages` reference table.
//
// Single source of truth — the spoken-language pickers
// (src/components/ui/spoken-language-checkboxes.tsx) and product
// surfaces (browse card, filters, detail page) all read from here.
export const SPOKEN_LANG_TO_COUNTRY: Record<string, string> = {
  fi: "FI",
  sv: "SE",
  en: "GB",
};

export type SpokenLanguageFlag = (typeof flags)[keyof typeof flags];

/** Lookup the flag component for a spoken-language code, or undefined.
 *  Suitable for callers that pass it as a prop into a JSX element — see
 *  `<FlagLabel>` in spoken-language-checkboxes.tsx. The product surfaces
 *  use `<LanguageFlag>` instead, which renders inline. */
export function getSpokenLanguageFlag(code: string): SpokenLanguageFlag | undefined {
  const country = SPOKEN_LANG_TO_COUNTRY[code];
  return country && isKeyOf(flags, country) ? flags[country] : undefined;
}

interface LanguageFlagProps {
  code: string;
  /** When true (default) shows the uppercase code next to the flag. */
  showCode?: boolean;
  /** Accessible label — usually the language's display name. */
  title?: string;
  className?: string;
}

// Small flag + uppercase language code chip. Matches the visual treatment
// of the locale picker in the site header so parents recognise it as a
// language indicator at a glance.
//
// The `flags[country]` index expression — rather than the indirect
// `getSpokenLanguageFlag()` helper — is what keeps
// `react-hooks/static-components` happy: the linter recognises a static
// constant lookup but flags any function call that returns a component.
export function LanguageFlag({
  code,
  showCode = true,
  title,
  className,
}: LanguageFlagProps) {
  const upper = code.toUpperCase();
  const country = SPOKEN_LANG_TO_COUNTRY[code];
  const Flag = country && isKeyOf(flags, country) ? flags[country] : undefined;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
        className,
      )}
    >
      {Flag && (
        <span className="h-3 w-[18px] overflow-hidden rounded-[1px] [&>svg]:h-full [&>svg]:w-full">
          <Flag title={title ?? upper} />
        </span>
      )}
      {showCode && <span>{upper}</span>}
    </span>
  );
}
