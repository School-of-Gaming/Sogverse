import { describe, it, expect } from "vitest";
import { formatDate, formatDateOnly, formatTime, formatTimeRange } from "@/lib/date-format";

describe("formatDate", () => {
  it("formats date strings", () => {
    const result = formatDate("2024-01-15T10:00:00Z", "en", {
      dateStyle: "medium",
      timeZone: "UTC",
    });
    expect(result).toBe("15 Jan 2024");
  });

  it("formats Date objects", () => {
    const date = new Date("2024-06-20");
    const result = formatDate(date, "en", {
      dateStyle: "medium",
      timeZone: "UTC",
    });
    expect(result).toBe("20 Jun 2024");
  });

  it("formats English the UK way: day before month, the zone's own short name", () => {
    // Bare `en` would hand Intl US conventions: "Sep 3", "GMT+3".
    expect(
      formatDate("2026-09-03T11:20:00Z", "en", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: "Europe/Helsinki",
      }),
    ).toBe("Thursday 3 September at 14:20 EEST");
  });

  it("falls back to the default locale's conventions for an unsupported locale", () => {
    expect(
      formatDate("2024-01-15T10:00:00Z", "en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      }),
    ).toBe("15 Jan 2024");
  });
});

describe("formatTime", () => {
  // No helper or caller pins the hour cycle: every formatting locale sets a
  // 24-hour clock by default, English included.
  it("renders a 24-hour clock in English", () => {
    expect(formatTime("2026-09-03T11:20:00Z", "en", "Europe/Helsinki")).toBe("14:20");
  });

  it("renders each locale's own 24-hour clock", () => {
    const at = "2026-09-03T11:20:00Z";
    expect(formatTime(at, "fi", "Europe/Helsinki")).toBe("14.20");
    expect(formatTime(at, "sv", "Europe/Helsinki")).toBe("14:20");
    expect(formatTime(at, "fr", "Europe/Helsinki")).toBe("14:20");
    expect(formatTime(at, "tlh", "Europe/Helsinki")).toBe("14:20");
  });

  it("renders a seat-offer deadline 24-hour in English with no hour-cycle pin", () => {
    const deadline = formatDate("2026-08-31T11:20:00Z", "en", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
      timeZone: "Europe/Helsinki",
    });
    expect(deadline).toBe("Monday 31 August at 14:20 EEST");
    expect(deadline).not.toMatch(/AM|PM/);
  });
});

describe("formatTimeRange", () => {
  it("names the zone by its short name in English", () => {
    expect(
      formatTimeRange(
        "2026-09-03T13:30:00Z",
        "2026-09-03T15:00:00Z",
        "en",
        "Europe/Helsinki",
      ),
    ).toBe("16:30–18:00 EEST");
  });
});

describe("formatDateOnly", () => {
  it("renders the exact calendar date, independent of runtime/viewer zone", () => {
    // UTC-pinned, so this is deterministic on any test runner and identical
    // across a server (UTC) / client (browser zone) render — no hydration drift.
    expect(formatDateOnly("2024-06-20", "en")).toBe("20 Jun 2024");
  });

  it("derives the weekday via the options arg", () => {
    // 2024-01-01 is a Monday.
    expect(formatDateOnly("2024-01-01", "en", { weekday: "long" })).toBe(
      "Monday",
    );
  });

  it("ignores a caller-supplied timeZone — a date-only value is zoneless", () => {
    // Even handed a negative-offset zone, the forced UTC keeps it on the 20th.
    expect(
      formatDateOnly("2024-06-20", "en", {
        timeZone: "America/New_York",
        dateStyle: "long",
      }),
    ).toBe("20 June 2024");
  });

  it("avoids the day-boundary slip that formatDate suffers on a bare date", () => {
    // The trap formatDateOnly exists to close: formatDate parses the string as
    // UTC midnight and renders in the viewer zone, tipping to the previous day.
    expect(
      formatDate("2024-06-20", "en", {
        timeZone: "America/New_York",
        dateStyle: "long",
      }),
    ).toBe("19 June 2024");
  });
});
