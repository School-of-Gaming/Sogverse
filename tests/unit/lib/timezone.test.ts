import { describe, expect, it } from "vitest";

import {
  formatTimezoneOptionLabel,
  isValidTimezone,
} from "@/lib/timezone";

/**
 * The picker label, which is not a translated string and therefore has nothing
 * in `messages/` to keep it honest.
 *
 * Two things can go wrong in it and both are silent. The offset is read at a
 * caller-supplied instant so it tracks DST, which nothing else in the app would
 * notice being wrong for half the year; and `Intl` abbreviates a zero offset to
 * a bare "GMT", which would leave one option in a list of four a different
 * shape from its neighbours.
 */
describe("formatTimezoneOptionLabel", () => {
  const JULY = new Date("2026-07-15T12:00:00Z");
  const JANUARY = new Date("2026-01-15T12:00:00Z");

  it("tracks DST rather than baking an offset in", () => {
    expect(formatTimezoneOptionLabel("Europe/Helsinki", JULY, "en")).toBe(
      "(GMT+03:00) Helsinki",
    );
    expect(formatTimezoneOptionLabel("Europe/Helsinki", JANUARY, "en")).toBe(
      "(GMT+02:00) Helsinki",
    );
  });

  it("renders a zero offset in the same shape as every other", () => {
    // `Intl`'s `longOffset` gives a bare "GMT" here, which is the one value
    // that would make the list ragged.
    expect(formatTimezoneOptionLabel("Europe/London", JANUARY, "en")).toBe(
      "(GMT+00:00) London",
    );
    expect(formatTimezoneOptionLabel("Europe/London", JULY, "en")).toBe(
      "(GMT+01:00) London",
    );
  });

  it("opens out the IANA id's underscores", () => {
    expect(formatTimezoneOptionLabel("America/New_York", JANUARY, "en")).toBe(
      "(GMT-05:00) New York",
    );
  });
});

describe("isValidTimezone", () => {
  it("admits a real IANA id and refuses anything Intl would throw on", () => {
    expect(isValidTimezone("Europe/Helsinki")).toBe(true);
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone(null)).toBe(false);
  });
});
