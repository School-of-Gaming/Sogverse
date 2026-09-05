"use client";

/**
 * The product form's spoken-language control, as a row of compact radio pills.
 *
 * One of a deliberately mismatched pair. This control and the region-lock cards
 * beside it both answer a country-shaped question with a flag on it, and an
 * admin building a club at speed must never take one for the other, so they are
 * given opposite silhouettes: **pills** here — intrinsic width, fully rounded,
 * one line, wrapping — and full-width bordered **cards** in a grid there. The
 * flags carry the same split: the small 18×12 chip that means "language"
 * everywhere in the app (`LanguageFlag`, the same treatment the locale picker
 * and the spoken-language checkboxes wear) against the visibly larger 28px
 * flag on a region-lock card.
 *
 * Required, with no pre-selection on a new product: the form's convention is
 * that fields are required by default and carry no marker, so the obligation is
 * stated by the native `required` on the radios and backstopped by the build's
 * own `spokenLanguageRequired` check rather than by an asterisk.
 */

import { LanguageFlag } from "@/components/ui/language-flag";
import { useLanguageNames } from "@/hooks/use-language-names";
import { cn } from "@/lib/utils";
import {
  SPOKEN_LANGUAGES,
  type SpokenLanguageCode,
} from "@/lib/constants/spoken-languages";

export function SpokenLanguageRadios({
  value,
  onChange,
  labelId,
  hintId,
}: {
  /** The selected language code, or `""` for the unanswered new-product state. */
  value: SpokenLanguageCode | "";
  onChange: (code: SpokenLanguageCode) => void;
  labelId: string;
  hintId: string | undefined;
}) {
  const languageName = useLanguageNames();

  return (
    // `radiogroup` + the field's own ids because a row of loose pills is named
    // and described by nothing otherwise.
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={hintId}
      className="flex flex-wrap gap-2"
    >
      {SPOKEN_LANGUAGES.map((code) => {
        const selected = value === code;
        const displayName = languageName(code);
        return (
          <label
            key={code}
            className={cn(
              "inline-flex cursor-pointer items-center gap-2 rounded-full border border-border py-1.5 pl-2.5 pr-3.5 text-sm transition-colors",
              selected && "bg-act/5"
            )}
          >
            {/* A visible native radio, as every other radio group in this form
                has: it carries the semantics, the arrow-key roving and the
                focus ring for free, and a pill whose only "chosen" signal was a
                border tint reads as a toggle rather than as one-of-many. */}
            <input
              type="radio"
              name="spokenLanguage"
              className="h-3.5 w-3.5"
              checked={selected}
              required
              onChange={() => onChange(code)}
            />
            {/* Decorative, exactly as the region-lock card's glyph slot is:
                every pill's language is already written next to it in words,
                so a titled flag would announce the same name twice. */}
            <span aria-hidden className="flex shrink-0 items-center">
              <LanguageFlag code={code} showCode={false} />
            </span>
            <span className="font-medium">{displayName}</span>
          </label>
        );
      })}
    </div>
  );
}
