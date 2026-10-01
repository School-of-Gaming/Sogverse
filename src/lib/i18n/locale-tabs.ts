import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "./resolve-translation";

/*
 * **Which language tab an editor of content written per locale shows** — the
 * product, Library article and Team profile editors alike, so an admin meets
 * one behaviour in all three.
 *
 * - An existing item opens on the tab a reader of the admin's UI locale would
 *   be shown (`resolveTranslation()`: the UI locale, then English, then the
 *   first written), and an item with nothing written on the UI locale.
 * - A new item opens on one tab, in the UI locale.
 * - Removing the tab being shown moves to the first remaining tab in
 *   `SUPPORTED_LOCALES` order, or to the UI locale when none remains.
 */

/** The tab an existing item opens on, given its written locales in row order. */
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
