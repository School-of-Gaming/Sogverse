"use client";

import { CircleCheck, CircleDashed, X } from "lucide-react";
import { useTranslations } from "next-intl";
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
  /**
   * Whether a tab's version is complete by the form's rule. Given, every tab
   * carries a mark saying so; left out, no tab carries one.
   */
  isComplete?: (locale: SupportedLocale) => boolean;
  /**
   * What is wrong with a tab that has to be fixed before a save — the sentence
   * a screen reader hears with it — or `null` for nothing. A tab with one is
   * drawn in the destructive hue, since the fault may sit behind a tab not
   * being shown.
   */
  attention?: (locale: SupportedLocale) => string | null;
}

/**
 * The language tab bar over content written per locale: one tab per written
 * locale, a close button on each while more than one is open, and a select that
 * adds a tab for any locale not yet written.
 *
 * **Only the bar, and its own words.** The fields beneath it, the drafts behind
 * it and the rule for what a complete tab is all belong to the form — the
 * tab-set helpers in `@/lib/i18n/locale-tabs` are what the form applies on each
 * callback. The caller wraps it in a `Field` carrying the label and the hint
 * that states the form's rule. The bar's own copy — the add select, the close
 * buttons, the complete marks — is the `localeTabs` namespace, the same in
 * every editor.
 *
 * The last tab has no close button: a content item always keeps one locale.
 * Tabs are labelled in each language's own name (`nativeLabel`), the way a
 * reader of that language would look for it; the add select and the close
 * buttons name languages in the viewer's.
 */
export function LocaleTabs({
  written,
  active,
  onSelect,
  onAdd,
  onRemove,
  isComplete,
  attention,
}: LocaleTabsProps) {
  const t = useTranslations("localeTabs");
  const languageName = useLanguageNames();
  const addable = SUPPORTED_LOCALES.filter((locale) => !written.includes(locale));
  const canRemove = written.length > 1;

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border">
      {written.map((locale) => {
        // exact-locale: a tab is keyed by the locale it writes
        const isActive = active === locale;
        const complete = isComplete?.(locale);
        const Mark = complete ? CircleCheck : CircleDashed;
        const problem = attention?.(locale) ?? null;
        return (
          <span
            key={locale}
            className={cn(
              "inline-flex items-center gap-1 rounded-t-md border-b-2 border-border px-3 py-1.5 text-sm transition-colors",
              problem !== null
                ? "text-destructive"
                : isActive
                  ? "text-act"
                  : "text-muted-foreground hover:text-foreground",
            )}
          >
            <button
              type="button"
              aria-pressed={isActive}
              className="inline-flex items-center gap-1.5"
              onClick={() => onSelect(locale)}
            >
              {LOCALE_CONFIG[locale].nativeLabel}
              {complete !== undefined && (
                <>
                  <Mark className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only">
                    {complete ? t("complete") : t("notComplete")}
                  </span>
                </>
              )}
              {problem !== null && <span className="sr-only">{problem}</span>}
            </button>
            {canRemove && (
              <button
                type="button"
                onClick={() => onRemove(locale)}
                className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                aria-label={t("removeLanguage", {
                  language: languageName(locale, LOCALE_CONFIG[locale].label),
                })}
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
          aria-label={t("addLanguage")}
          onChange={(event) => {
            const locale = findOption(addable, event.target.value);
            if (locale) onAdd(locale);
          }}
          className="mb-1 ml-1 h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
        >
          <option value="">{t("addLanguage")}</option>
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
