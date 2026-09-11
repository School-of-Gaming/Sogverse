/**
 * A language code's name in a reader's locale — "fi" → Finnish / suomi /
 * finska / finnois, depending on who is reading.
 *
 * The pure half of `useLanguageNames`, extracted because a mail needs the same
 * answer and cannot call a hook: the confirmation email states a product's
 * spoken language by name where the page shows a flag chip, and the *rule* for
 * getting that name — which locale list to ask Intl in, what to do with a code
 * it refuses, and Klingon — is one rule either way.
 *
 * `fallback: "none"` is load-bearing: the default ("code") makes `.of()` return
 * the code itself for any well-formed tag Intl has no data for, so the `??`
 * chain below would never fire and an unknown tag would render raw instead of
 * its configured name.
 *
 * `"en"` second: for a locale Intl has no data for (Klingon), a bare `[locale]`
 * falls back to the RUNTIME default locale — different on a server and on each
 * visitor's machine, i.e. a hydration mismatch in the app and a machine-
 * dependent render in a test. The explicit second entry makes the answer
 * deterministic English everywhere.
 */
export function languageDisplayNames(
  locale: string,
): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale, "en"], {
      type: "language",
      fallback: "none",
    });
  } catch {
    return null;
  }
}

/**
 * One code, named — or the caller's fallback, or the code itself.
 *
 * **Klingon is never asked of Intl.** Whether CLDR names it depends on the ICU
 * build: one Node names it in French, Finnish and Swedish while the browser
 * hydrating that markup does not, which is a mismatch that flips as either side
 * updates. So `tlh` answers with the caller's fallback, deterministically. That
 * also matches the house rule for the easter egg — "Klingon" is a mark, like
 * "Sogverse", and is not translated.
 */
export function languageDisplayName(
  displayNames: Intl.DisplayNames | null,
  code: string,
  fallback?: string,
): string {
  if (code === "tlh") return fallback ?? code;
  try {
    return displayNames?.of(code) ?? fallback ?? code;
  } catch {
    // RangeError on a structurally invalid tag — the fallback is exactly for a
    // code Intl refuses.
    return fallback ?? code;
  }
}

/** Both steps at once, for a caller with one code and no instance to reuse. */
export function languageNameIn(
  code: string,
  locale: string,
  fallback?: string,
): string {
  return languageDisplayName(languageDisplayNames(locale), code, fallback);
}
