import { describe, it, expect } from "vitest";
import { spokenLanguagesPhrase } from "@/lib/i18n/spoken-languages-phrase";

/**
 * **The languages a public sentence names are derived, never written into
 * copy.** Pinned here: the list follows the `spoken_language` enum's order,
 * each name is in the reader's locale (lowercase in Finnish), the English join
 * is UK English with no comma before "and", and a Klingon reader gets English.
 * The expected phrases spell out today's enum, so a language added by
 * migration updates them here.
 */
describe("spokenLanguagesPhrase", () => {
  it("joins the names in UK English, with no Oxford comma", () => {
    expect(spokenLanguagesPhrase("en")).toBe("Finnish, Swedish, English and French");
  });

  it("names the languages in Finnish for a Finnish reader", () => {
    expect(spokenLanguagesPhrase("fi")).toBe("suomi, ruotsi, englanti ja ranska");
  });

  it("gives a Klingon reader the English phrase", () => {
    expect(spokenLanguagesPhrase("tlh")).toBe(spokenLanguagesPhrase("en"));
  });
});
