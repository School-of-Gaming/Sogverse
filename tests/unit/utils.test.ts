import { describe, it, expect, afterEach, vi } from "vitest";
import {
  cn,
  computeAge,
  formatCurrency,
  formatCurrencyFromCents,
  formatDate,
  formatDateOnly,
  capitalize,
} from "@/lib/utils";

describe("cn (className merge utility)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const includeBar = false as boolean;
    expect(cn("foo", includeBar && "bar", "baz")).toBe("foo baz");
  });

  it("merges Tailwind classes correctly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("formatCurrency", () => {
  it("formats with the given locale and currency symbol", () => {
    const result = formatCurrency(100, "eur", "en-GB");
    expect(result).toContain("€");
    expect(result).toContain("100");
  });
});

describe("formatCurrencyFromCents", () => {
  it("divides cents by 100 before formatting", () => {
    const result = formatCurrencyFromCents(1500, "eur", "en-US");
    expect(result).toContain("€");
    expect(result).toContain("15");
  });
});

describe("formatDate", () => {
  it("formats date strings", () => {
    const result = formatDate("2024-01-15T10:00:00Z", "en-US", {
      dateStyle: "medium",
      timeZone: "UTC",
    });
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("formats Date objects", () => {
    const date = new Date("2024-06-20");
    const result = formatDate(date, "en-US", {
      dateStyle: "medium",
      timeZone: "UTC",
    });
    expect(result).toContain("Jun");
    expect(result).toContain("20");
  });
});

describe("formatDateOnly", () => {
  it("renders the exact calendar date, independent of runtime/viewer zone", () => {
    // UTC-pinned, so this is deterministic on any test runner and identical
    // across a server (UTC) / client (browser zone) render — no hydration drift.
    expect(formatDateOnly("2024-06-20", "en-US")).toContain("Jun 20");
  });

  it("derives the weekday via the options arg", () => {
    // 2024-01-01 is a Monday.
    expect(formatDateOnly("2024-01-01", "en-US", { weekday: "long" })).toBe(
      "Monday",
    );
  });

  it("ignores a caller-supplied timeZone — a date-only value is zoneless", () => {
    // Even handed a negative-offset zone, the forced UTC keeps it on the 20th.
    expect(
      formatDateOnly("2024-06-20", "en-US", {
        timeZone: "America/New_York",
        dateStyle: "long",
      }),
    ).toContain("June 20");
  });

  it("avoids the day-boundary slip that formatDate suffers on a bare date", () => {
    // The trap formatDateOnly exists to close: formatDate parses the string as
    // UTC midnight and renders in the viewer zone, tipping to the previous day.
    expect(
      formatDate("2024-06-20", "en-US", {
        timeZone: "America/New_York",
        dateStyle: "long",
      }),
    ).toContain("June 19");
  });
});

describe("computeAge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns whole years between DOB and today in the supplied zone", () => {
    // Fixed wall-clock instant: 2026-05-19 12:00 UTC.
    vi.setSystemTime(new Date("2026-05-19T12:00:00Z"));
    expect(computeAge("2010-05-19", "Europe/Helsinki")).toBe(16);
    expect(computeAge("2010-05-20", "Europe/Helsinki")).toBe(15);
    expect(computeAge("2010-05-18", "Europe/Helsinki")).toBe(16);
  });

  it("crosses the day boundary in the supplied zone, not UTC", () => {
    // 2026-01-01 02:00 UTC is still 2025-12-31 in America/Los_Angeles.
    // A child whose 10th birthday is 2026-01-01 turns 10 on the UTC date,
    // but in LA they are still 9. computeAge must follow the LA calendar.
    vi.setSystemTime(new Date("2026-01-01T02:00:00Z"));
    expect(computeAge("2016-01-01", "UTC")).toBe(10);
    expect(computeAge("2016-01-01", "America/Los_Angeles")).toBe(9);
  });
});

describe("capitalize", () => {
  it("capitalizes first letter", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  it("lowercases rest of string", () => {
    expect(capitalize("HELLO")).toBe("Hello");
  });

  it("handles single character", () => {
    expect(capitalize("a")).toBe("A");
  });

  it("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });
});
