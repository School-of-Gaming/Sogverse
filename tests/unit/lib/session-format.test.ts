import { describe, it, expect } from "vitest";
import {
  formatCountdownCompound,
  formatSessionDateTimeRange,
} from "@/lib/session-format";

describe("formatSessionDateTimeRange", () => {
  it("formats start and end in the same locale + timezone", () => {
    // Helsinki (UTC+2 winter, UTC+3 summer). Pick a winter instant for a
    // stable offset.
    const start = new Date("2026-02-02T14:00:00Z"); // Mon 16:00 Helsinki
    const end = new Date("2026-02-02T16:00:00Z"); // Mon 18:00 Helsinki

    const en = formatSessionDateTimeRange(start, end, "en-US", "Europe/Helsinki");
    expect(en).toMatch(/Mon, February 2 · 16:00 – 18:00/);
  });

  it("uses 24-hour time in en", () => {
    const start = new Date("2026-02-02T18:30:00Z"); // 20:30 Helsinki
    const end = new Date("2026-02-02T20:30:00Z"); // 22:30 Helsinki
    const out = formatSessionDateTimeRange(
      start,
      end,
      "en-US",
      "Europe/Helsinki",
    );
    expect(out).toContain("20:30");
    expect(out).toContain("22:30");
    expect(out).not.toMatch(/AM|PM/);
  });

  it("renders the time range even when the session crosses midnight", () => {
    // Start 23:00 local, end 01:00 next-day local.
    const start = new Date("2026-02-02T21:00:00Z"); // 23:00 Helsinki Mon
    const end = new Date("2026-02-02T23:00:00Z"); // 01:00 Helsinki Tue
    const out = formatSessionDateTimeRange(
      start,
      end,
      "en-US",
      "Europe/Helsinki",
    );
    expect(out).toContain("23:00");
    expect(out).toContain("01:00");
  });
});

describe("formatCountdownCompound", () => {
  const en = "en-US";

  it("returns minutes-only under one hour", () => {
    expect(formatCountdownCompound(37 * 60_000, en)).toMatch(/^37 minutes?$/);
  });

  it("returns hours + minutes between 1h and 24h", () => {
    // 8h 12m
    const ms = (8 * 60 + 12) * 60_000;
    const out = formatCountdownCompound(ms, en);
    expect(out).toMatch(/8 hours/);
    expect(out).toMatch(/12 minutes/);
  });

  it("omits the secondary unit when it's zero (no '2 days, 0 hours')", () => {
    const twoDays = 2 * 24 * 60 * 60_000;
    expect(formatCountdownCompound(twoDays, en)).toMatch(/^2 days$/);

    const exactlyFiveHours = 5 * 60 * 60_000;
    expect(formatCountdownCompound(exactlyFiveHours, en)).toMatch(/^5 hours$/);
  });

  it("clamps negatives to 0 minutes", () => {
    expect(formatCountdownCompound(-1, en)).toMatch(/^0 minutes$/);
  });

  it("uses days + hours between 1d and N days", () => {
    // 2d 5h
    const ms = (2 * 24 + 5) * 60 * 60_000;
    const out = formatCountdownCompound(ms, en);
    expect(out).toMatch(/2 days/);
    expect(out).toMatch(/5 hours/);
  });

  it("is locale-aware (Finnish unit words)", () => {
    const ms = 45 * 60_000;
    const fi = formatCountdownCompound(ms, "fi-FI");
    expect(fi.toLowerCase()).toMatch(/minuut/);
  });
});
