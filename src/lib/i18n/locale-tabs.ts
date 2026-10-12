import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "./resolve-translation";

/*
 * **Which language tab an editor of content written per locale shows** — the
 * product, Library article, Team profile and holiday calendar editors alike, so
 * an admin meets one behaviour in all of them.
 *
 * - An existing item opens on the tab a reader of the admin's UI locale would
 *   be shown (`resolveTranslation()`: the UI locale, then English, then the
 *   first written in `SUPPORTED_LOCALES` order); an item with nothing written
 *   at all opens on the UI locale.
 * - A new item opens on one tab, in the UI locale.
 * - Removing the tab being shown moves to the first remaining tab in
 *   `SUPPORTED_LOCALES` order, or to the UI locale when none remains.
 */

/** The tab an existing item opens on, given its written locales in `SUPPORTED_LOCALES` order (`inLocaleOrder`). */
export function openingLocaleTab(
  written: readonly SupportedLocale[],
  uiLocale: SupportedLocale,
): SupportedLocale {
  return (
    resolveTranslation(
      written.map((locale) => ({ locale })),
      uiLocale,
    )?.locale ?? uiLocale
  );
}

/**
 * The tab shown once `removed` is closed: the one already shown when it was
 * another, else the first of `remaining` (the tabs still open, after the
 * removal) in `SUPPORTED_LOCALES` order, else the UI locale.
 */
export function localeTabAfterRemoving(
  remaining: Partial<Record<SupportedLocale, unknown>>,
  active: SupportedLocale,
  removed: SupportedLocale,
  uiLocale: SupportedLocale,
): SupportedLocale {
  if (active !== removed) return active;
  return (
    SUPPORTED_LOCALES.find((locale) => remaining[locale] !== undefined) ??
    uiLocale
  );
}

/*
 * **The tab set itself**, as the product form and the holiday calendar form
 * both hold it: one draft per written locale, keyed by locale, plus the tab
 * being shown. The draft is whatever that form writes per locale — a product's
 * name and descriptions, a calendar's break names — so these helpers never look
 * inside one. Pure, so each form applies them inside its own state setter.
 */

/** One draft per written locale, and the tab being shown. */
export interface LocaleTabState<T> {
  drafts: Partial<Record<SupportedLocale, T>>;
  active: SupportedLocale;
}

/** The locales that have a tab, in `SUPPORTED_LOCALES` order. */
export function writtenLocales(
  drafts: Partial<Record<SupportedLocale, unknown>>,
): SupportedLocale[] {
  return SUPPORTED_LOCALES.filter((locale) => drafts[locale] !== undefined);
}

/** Open a tab for `locale`, seeded with `draft`, and show it. */
export function addLocaleTab<T>(
  state: LocaleTabState<T>,
  locale: SupportedLocale,
  draft: T,
): LocaleTabState<T> {
  return { drafts: { ...state.drafts, [locale]: draft }, active: locale };
}

/**
 * Close `locale`'s tab, discarding what was written in it, and move to the tab
 * `localeTabAfterRemoving` picks. The tab bar never offers to close the last
 * tab, so an item always keeps at least one.
 */
export function removeLocaleTab<T>(
  state: LocaleTabState<T>,
  locale: SupportedLocale,
  uiLocale: SupportedLocale,
): LocaleTabState<T> {
  const drafts = { ...state.drafts };
  delete drafts[locale];
  return {
    drafts,
    active: localeTabAfterRemoving(drafts, state.active, locale, uiLocale),
  };
}

/**
 * What is wrong with a set of per-locale drafts under the rule authored content
 * follows: **at least one locale complete, and no tab left half-written.** Any
 * single locale is enough, because a reader is shown theirs, else English, else
 * the first written (`resolveTranslation()`); a tab that is open but not
 * complete is refused rather than saved as a gap, so what was added is either
 * finished or removed.
 *
 * `none` when no tab is complete; `incomplete` names the first open tab, in
 * `SUPPORTED_LOCALES` order, that is not. The locale is a code — the caller
 * turns it into the reader's language name.
 */
export type LocaleDraftsProblem =
  | { kind: "none" }
  | { kind: "incomplete"; locale: SupportedLocale };

export function checkLocaleDrafts<T>(
  drafts: Partial<Record<SupportedLocale, T>>,
  isComplete: (draft: T) => boolean,
): LocaleDraftsProblem | null {
  const written = SUPPORTED_LOCALES.flatMap((locale) => {
    const draft = drafts[locale];
    return draft === undefined ? [] : [{ locale, complete: isComplete(draft) }];
  });
  if (!written.some((entry) => entry.complete)) return { kind: "none" };
  const half = written.find((entry) => !entry.complete);
  return half ? { kind: "incomplete", locale: half.locale } : null;
}
