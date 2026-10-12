"use client";

import { CircleCheck, CircleDashed, X } from "lucide-react";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { cn, findOption } from "@/lib/utils";

/**
 * **The language tabs of an admin editor whose text is written per locale** —
 * a Library article's and a spotlight's: a tab per language written, each
 * marked complete or not, a remove control on each while more than one
 * remains, and an "add a language" select for the rest.
 *
 * It owns no state. Which tabs are open and which is shown are the editor's,
 * and so is what a tab opening, closing or being picked does to them — the
 * editor answers those through `src/lib/i18n/locale-tabs.ts`, so every editor
 * opens and closes tabs alike.
 */
export function LocaleVersionTabs({
  open,
  active,
  isComplete,
  onSelect,
  onAdd,
  onRemove,
  labels,
}: {
  /** The tabs open, in `SUPPORTED_LOCALES` order. */
  open: readonly SupportedLocale[];
  active: SupportedLocale;
  /** Whether a tab's version holds everything a reader needs. */
  isComplete: (locale: SupportedLocale) => boolean;
  onSelect: (locale: SupportedLocale) => void;
  onAdd: (locale: SupportedLocale) => void;
  onRemove: (locale: SupportedLocale) => void;
  labels: {
    /** The select's label and its empty option. */
    addLocale: string;
    /** The remove control's accessible name, given the language's name. */
    removeLocale: (language: string) => string;
    /** What a screen reader hears after a complete tab's name. */
    complete: string;
    /** What a screen reader hears after an incomplete tab's name. */
    incomplete: string;
  };
}) {
  const languageName = useLanguageNames();
  const addable = SUPPORTED_LOCALES.filter((locale) => !open.includes(locale));

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border">
      {open.map((locale) => {
        const isActive = active === locale;
        const complete = isComplete(locale);
        const Mark = complete ? CircleCheck : CircleDashed;
        return (
          <span
            key={locale}
            className={cn(
              "inline-flex items-center gap-1 rounded-t-md border-b-2 border-border px-3 py-1.5 text-sm transition-colors",
              isActive ? "text-act" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <button
              type="button"
              aria-pressed={isActive}
              className="inline-flex items-center gap-1.5"
              onClick={() => onSelect(locale)}
            >
              {LOCALE_CONFIG[locale].nativeLabel}
              <Mark className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">
                {complete ? labels.complete : labels.incomplete}
              </span>
            </button>
            {open.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(locale)}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                aria-label={labels.removeLocale(
                  languageName(locale, LOCALE_CONFIG[locale].label),
                )}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
      {addable.length > 0 && (
        <select
          value=""
          aria-label={labels.addLocale}
          onChange={(event) => {
            const next = findOption(addable, event.target.value);
            if (next) onAdd(next);
          }}
          className="mb-1 ml-1 h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
        >
          <option value="">{labels.addLocale}</option>
          {addable.map((locale) => (
            <option key={locale} value={locale}>
              {languageName(locale, LOCALE_CONFIG[locale].label)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
