import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLanguageNames } from "@/hooks/use-language-names";

let uiLocale = "en";
vi.mock("next-intl", () => ({
  useLocale: () => uiLocale,
}));

/**
 * The one answer this hook must give without consulting `Intl`.
 *
 * Whether CLDR names Klingon depends on the ICU build — the Node that renders
 * the server HTML names it in French, Finnish and Swedish, the browser that
 * hydrates it may not and falls back to English — so any `Intl` answer for
 * `tlh` is a hydration mismatch waiting for the two to disagree. The hook
 * answers with the caller's fallback on both sides, and this pins that it
 * does so even where this runtime's `Intl` *would* have had a name.
 */
describe("useLanguageNames", () => {
  it("names Klingon from the fallback, never from Intl, in every UI locale", () => {
    for (const locale of ["en", "fi", "sv", "fr"]) {
      uiLocale = locale;
      const { result } = renderHook(() => useLanguageNames());
      expect(result.current("tlh", "Klingon"), locale).toBe("Klingon");
    }
  });

  it("still names a real language in the viewer's locale", () => {
    uiLocale = "fr";
    const { result } = renderHook(() => useLanguageNames());
    expect(result.current("fi")).toBe("finnois");
  });
});
