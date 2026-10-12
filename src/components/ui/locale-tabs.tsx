"use client";

import { X } from "lucide-react";
import { useLanguageNames } from "@/hooks/use-language-names";
import { LOCALE_CONFIG, SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/constants/locales";
import { cn, findOption } from "@/lib/utils";

interface LocaleTabsProps {
  /** The locales with a tab, in `SUPPORTED_LOCALES` order (`writtenLocales`). */
  written: readonly SupportedLocale[];
  /** The tab being shown. */
  active: SupportedLocale;
  onSelect: (locale: SupportedLocale) => void;
  onAdd: (locale: SupportedLocale) => void;
  onRemove: (locale: SupportedLocale) => void;
  /** The add select's resting option, which is also its accessible name. */
  addLabel: string;
  /** A tab's close button's accessible name, given the language's name. */
  removeLabel: (language: string) => string;
}

/**
 * The language tab bar over content an admin writes per locale: one tab per
 * written locale, a close button on each while more than one is open, and a
 * select that adds a tab for any locale not yet written.
 *
 * **Only the bar.** The fields beneath it, the drafts behind it and the rule
 * for what a complete tab is all belong to the form — the tab-set helpers in
 * `@/lib/i18n/locale-tabs` are what the form applies on each callback — so the
 * same bar sits over a product's name and descriptions and over a holiday
 * calendar's break names. The caller wraps it in a `Field` carrying the label
 * and the hint that states the form's rule.
 *
 * The last tab has no close button: a content item always keeps one locale.
 * Tabs are labelled in each language's own name (`nativeLabel`), the way a
 * reader of that language would look for it; the add select names languages
 * in the viewer's.
 */
export function LocaleTabs({
  written,
  active,
  onSelect,
  onAdd,
  onRemove,
  addLabel,
  removeLabel,
}: LocaleTabsProps) {
  const languageName = useLanguageNames();
  const addable = SUPPORTED_LOCALES.filter((locale) => !written.includes(locale));
  const canRemove = written.length > 1;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border">
      {written.map((locale) => {
        const isActive = active === locale;
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
              onClick={() => onSelect(locale)}
            >
              {LOCALE_CONFIG[locale].nativeLabel}
            </button>
            {canRemove && (
              <button
                type="button"
                onClick={() => onRemove(locale)}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                aria-label={removeLabel(languageName(locale, LOCALE_CONFIG[locale].label))}
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
          aria-label={addLabel}
          onChange={(event) => {
            const locale = findOption(addable, event.target.value);
            if (locale) onAdd(locale);
          }}
          className="mb-1 ml-1 h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
        >
          <option value="">{addLabel}</option>
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
