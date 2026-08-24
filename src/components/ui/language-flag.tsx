"use client";

import { FLAGS, type FlagCountry } from "@/components/ui/flags";
import type { SpokenLanguageCode } from "@/types";
import { cn } from "@/lib/utils";

// Spoken-language → country code mapping for flag display.
//
// Single source of truth — the spoken-language pickers
// (src/components/ui/spoken-language-checkboxes.tsx) and product
// surfaces (browse card, filters, detail page) all read from here.
//
// Two compile-time obligations meet in this one declaration. The key side is
// `SpokenLanguageCode`, the generated enum, so a language added by migration
// fails the build here until someone decides which flag it wears — the map
// cannot silently fall behind the database. The value side is `FlagCountry`,
// the flag registry in flags.ts, so a country whose flag was never imported
// fails the build too, rather than rendering nothing. Neither side admits
// `undefined`: a finite key union is not an index signature, so every lookup
// below is a hit by construction.
export const SPOKEN_LANG_TO_COUNTRY: Record<SpokenLanguageCode, FlagCountry> = {
  fi: "FI",
  sv: "SE",
  en: "GB",
  fr: "FR",
};

export type SpokenLanguageFlag = (typeof FLAGS)[keyof typeof FLAGS];

/** The flag component for a spoken-language code. Suitable for callers that
 *  pass it as a prop into a JSX element — see `<FlagLabel>` in
 *  spoken-language-checkboxes.tsx. The product surfaces use `<LanguageFlag>`
 *  instead, which renders inline. */
export function getSpokenLanguageFlag(code: SpokenLanguageCode): SpokenLanguageFlag {
  return FLAGS[SPOKEN_LANG_TO_COUNTRY[code]];
}

interface LanguageFlagProps {
  code: SpokenLanguageCode;
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
// The `FLAGS[country]` index expression — rather than the indirect
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
  const Flag = FLAGS[SPOKEN_LANG_TO_COUNTRY[code]];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-xs font-medium",
        className,
      )}
    >
      <span className="h-3 w-[18px] overflow-hidden rounded-[1px] [&>svg]:h-full [&>svg]:w-full">
        <Flag title={title ?? upper} />
      </span>
      {showCode && <span>{upper}</span>}
    </span>
  );
}
