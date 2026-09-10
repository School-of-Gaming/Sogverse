import { describe, it, expect } from "vitest";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/constants/locales";
import en from "../../messages/en.json";
import fi from "../../messages/fi.json";
import sv from "../../messages/sv.json";
import fr from "../../messages/fr.json";
import tlh from "../../messages/tlh.json";

/**
 * The site-wide card's subline has to fit on ONE line in every locale.
 *
 * The card sets the subline at a fixed 32px so it survives being shrunk to
 * thumbnail width, and draws it inside the card's 1040px measure — so the size
 * cannot give, and the copy is what has to. Every string over the budget
 * wrapped, and a second line holding one orphaned word is what this pins
 * against. The budget is a character count rather than a rendered measure
 * because satori's layout is not something a test can ask about; it tracks the
 * longest string verified to fit (Finnish, 63 characters of narrow letters),
 * so a wider alphabet may wrap below it — check the rendered card when a
 * string gets close.
 *
 * A locale that needs more than this says something shorter, not smaller.
 */
const SUBLINE_BUDGET = 63;

const SUBLINES: Record<SupportedLocale, string> = {
  en: en.metadata.og.site.subline,
  fi: fi.metadata.og.site.subline,
  sv: sv.metadata.og.site.subline,
  fr: fr.metadata.og.site.subline,
  tlh: tlh.metadata.og.site.subline,
};

describe("the site card's subline fits one line in every locale", () => {
  it.each(SUPPORTED_LOCALES)("%s", (locale) => {
    expect(SUBLINES[locale].length).toBeLessThanOrEqual(SUBLINE_BUDGET);
  });
});
