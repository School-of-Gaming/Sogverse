import { describe, expect, it } from "vitest";

import {
  formatTimezoneOptionLabel,
  isValidTimezone,
} from "@/lib/timezone";

/**
 * The picker label, which is not a translated string and therefore has nothing
 * in `messages/` to keep it honest.
 *
 * Three things can go wrong in it and all of them are silent. The offset is
 * read at a caller-supplied instant so it tracks DST, which nothing else in the
 * app would notice being wrong for half the year; a zero offset has to come out
 * in the same shape as every other, or one option in a list of four is ragged;
 * and a zone whose offset is not a whole number of hours has to keep its
 * minutes.
 */
describe("formatTimezoneOptionLabel", () => {
  const JULY = new Date("2026-07-15T12:00:00Z");
  const JANUARY = new Date("2026-01-15T12:00:00Z");

  it("tracks DST rather than baking an offset in", () => {
    expect(formatTimezoneOptionLabel("Europe/Helsinki", JULY)).toBe(
      "(GMT+03:00) Helsinki",
    );
    expect(formatTimezoneOptionLabel("Europe/Helsinki", JANUARY)).toBe(
      "(GMT+02:00) Helsinki",
    );
  });

  it("renders a zero offset in the same shape as every other", () => {
    // The shape a localized `Intl` offset part would have abbreviated away to a
    // bare prefix with no digits — the one value that would make the list
    // ragged.
    expect(formatTimezoneOptionLabel("Europe/London", JANUARY)).toBe(
      "(GMT+00:00) London",
    );
    expect(formatTimezoneOptionLabel("Europe/London", JULY)).toBe(
      "(GMT+01:00) London",
    );
  });

  it("signs a negative offset and opens out the IANA id's underscores", () => {
    expect(formatTimezoneOptionLabel("America/New_York", JANUARY)).toBe(
      "(GMT-05:00) New York",
    );
  });

  it("keeps the minutes of a half-hour zone", () => {
    expect(formatTimezoneOptionLabel("Asia/Kolkata", JANUARY)).toBe(
      "(GMT+05:30) Kolkata",
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
