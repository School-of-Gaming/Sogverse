import { describe, it, expect } from "vitest";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { formatTimeRange } from "@/lib/utils";

// A summer instant, so Helsinki is a stable UTC+3.
const START = new Date("2026-09-23T15:00:00Z"); // 18:00 Helsinki
const END = new Date("2026-09-23T16:30:00Z"); // 19:30 Helsinki

describe("formatTimeRange", () => {
  // The space the runtime's locale data sets beside a range's dash differs
  // between the server and the browser, and this string is rendered on both
  // sides of a hydration. The assertion is on the characters rather than on a
  // whole expected string, so it holds whichever data this runtime carries.
  it.each(SUPPORTED_LOCALES)(
    "sets no thin or narrow space beside the dash in %s",
    (locale) => {
      const out = formatTimeRange(START, END, locale, "Europe/Helsinki");
      expect(out).not.toMatch(/[\u2009\u202f]\u2013|\u2013[\u2009\u202f]/);
    },
  );

  it("formats both ends from their own instants and names the zone", () => {
    expect(formatTimeRange(START, END, "en", "Europe/Helsinki")).toBe(
      "18:00 \u2013 19:30 GMT+3",
    );
  });
});
