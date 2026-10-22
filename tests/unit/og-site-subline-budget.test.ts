import { describe, it, expect } from "vitest";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/constants/locales";
import enMetadata from "../../messages/en/metadata.json";
import fiMetadata from "../../messages/fi/metadata.json";
import svMetadata from "../../messages/sv/metadata.json";
import frMetadata from "../../messages/fr/metadata.json";
import tlhMetadata from "../../messages/tlh/metadata.json";

const en = { metadata: enMetadata };
const fi = { metadata: fiMetadata };
const sv = { metadata: svMetadata };
const fr = { metadata: frMetadata };
const tlh = { metadata: tlhMetadata };

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
