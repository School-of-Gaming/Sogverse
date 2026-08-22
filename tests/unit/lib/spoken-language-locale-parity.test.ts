import { describe, it, expect } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { SPOKEN_LANGUAGES } from "@/lib/constants/spoken-languages";

/**
 * Parity tripwire between the two deliberately separate language systems.
 *
 * `locale` (which translation of the app you see) and `spoken_languages` (the
 * human languages a user speaks / a club is delivered in) are not merged and
 * never should be. But they carry a one-way requirement: shipping a UI locale
 * says we serve families who speak that language, so a club must be offerable
 * in it the same day — and `products.spoken_language_code` can only hold a
 * value of the `spoken_language` enum.
 *
 * The requirement runs one way and only one way. A spoken language with no UI
 * locale is perfectly ordinary — it says we run clubs in a language we have not
 * translated the app into — so nothing here asserts the reverse.
 *
 * Klingon is exempt: an easter-egg locale is not a language a club is delivered
 * in. It is excluded by name rather than by a "novelty" flag because it is the
 * only one, and a second novelty locale should be a deliberate decision here.
 *
 * **This lives in unit, not db, and that is the whole point of 00199.** The
 * languages used to be rows in a reference table, so the claim could only be
 * checked against a running database; they are now a Postgres enum reaching
 * TypeScript through codegen, so a locale added without its migration fails
 * here — in the fast suite, on a laptop, with no Postgres anywhere.
 */
describe("UI locale ↔ spoken-language parity", () => {
  const NOVELTY_LOCALES = ["tlh"];

  it("has a spoken_language value for every non-novelty locale", () => {
    const expected = SUPPORTED_LOCALES.filter(
      (locale) => !NOVELTY_LOCALES.includes(locale),
    );
    const missing = expected.filter(
      (locale) => !SPOKEN_LANGUAGES.some((code) => code === locale),
    );

    expect(missing).toEqual([]);
  });
});
