import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cn,
  formatCurrency,
  formatCurrencyFromCents,
  formatDate,
  generateGamerEmail,
  extractUsernameFromGamerEmail,
  isGamerEmail,
  capitalize,
  formatScheduleLocal,
} from "@/lib/utils";

describe("cn (className merge utility)", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
  });

  it("merges Tailwind classes correctly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });
});

describe("formatCurrency", () => {
  it("falls back to CURRENCY_CONFIG locale when navigator is unavailable", () => {
    // In test/server environments there's no navigator, so it should
    // fall back to the hardcoded locale from CURRENCY_CONFIG
    const result = formatCurrency(100, "gbp");
    expect(result).toContain("£");
    expect(result).toContain("100");
  });
});

describe("formatCurrencyFromCents", () => {
  it("divides cents by 100 before formatting", () => {
    const result = formatCurrencyFromCents(1500, "usd");
    expect(result).toContain("$");
    expect(result).toContain("15");
  });
});

describe("formatDate", () => {
  it("formats date strings", () => {
    const result = formatDate("2024-01-15T10:00:00Z");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("formats Date objects", () => {
    const date = new Date("2024-06-20");
    const result = formatDate(date);
    expect(result).toContain("Jun");
    expect(result).toContain("20");
  });
});

describe("gamer email utilities", () => {
  describe("generateGamerEmail", () => {
    it("generates synthetic email from username", () => {
      expect(generateGamerEmail("testuser")).toBe(
        "testuser@gamer.sogverse.internal"
      );
    });

    it("converts username to lowercase", () => {
      expect(generateGamerEmail("TestUser")).toBe(
        "testuser@gamer.sogverse.internal"
      );
    });
  });

  describe("extractUsernameFromGamerEmail", () => {
    it("extracts username from valid gamer email", () => {
      expect(
        extractUsernameFromGamerEmail("testuser@gamer.sogverse.internal")
      ).toBe("testuser");
    });

    it("returns null for non-gamer emails", () => {
      expect(extractUsernameFromGamerEmail("test@example.com")).toBeNull();
    });

    it("returns null for invalid emails", () => {
      expect(extractUsernameFromGamerEmail("not-an-email")).toBeNull();
    });
  });

  describe("isGamerEmail", () => {
    it("returns true for gamer emails", () => {
      expect(isGamerEmail("test@gamer.sogverse.internal")).toBe(true);
    });

    it("returns false for regular emails", () => {
      expect(isGamerEmail("test@example.com")).toBe(false);
    });
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


describe("formatScheduleLocal", () => {
  // Pin the test timezone so results are deterministic in any CI environment.
  // We mock Intl.DateTimeFormat to control the "local" timezone.
  const RealDateTimeFormat = Intl.DateTimeFormat;

  afterEach(() => {
    Intl.DateTimeFormat = RealDateTimeFormat;
  });

  /**
   * Helper: override the default (no-timeZone) formatters to use a fixed TZ,
   * while leaving explicit-timeZone formatters untouched.
   * Also pins locale to "en-US" when the caller passes undefined, so
   * assertions on day names and AM/PM are deterministic regardless of the
   * test runner's system locale.
   */
  function pinLocalTimezone(tz: string) {
    const Original = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function (
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      const resolvedLocale = locale ?? "en-US";
      // If the caller didn't specify a timeZone, inject our pinned TZ
      if (options && !options.timeZone) {
        return new Original(resolvedLocale, { ...options, timeZone: tz });
      }
      return new Original(resolvedLocale, options);
    } as typeof Intl.DateTimeFormat;
    // Preserve static methods
    Intl.DateTimeFormat.supportedLocalesOf = Original.supportedLocalesOf;
  }

  it("returns a valid day name, formatted time, and timezone abbreviation", () => {
    pinLocalTimezone("Europe/Helsinki");
    const result = formatScheduleLocal(0, "16:00", "Europe/Helsinki");

    // Should return recognizable values regardless of local TZ
    expect(typeof result.localDay).toBe("string");
    expect(result.localDay.length).toBeGreaterThan(0);
    expect(result.localTime).toMatch(/\d{1,2}:\d{2}/);
    expect(typeof result.tzAbbrev).toBe("string");
  });

  it("handles HH:MM:SS format (DB returns seconds)", () => {
    pinLocalTimezone("Europe/Helsinki");
    const result = formatScheduleLocal(2, "17:30:00", "Europe/Helsinki");

    expect(result.localTime).toMatch(/\d{1,2}:\d{2}/);
  });

  it("converts to a different timezone when source and local differ", () => {
    pinLocalTimezone("America/New_York");

    // 16:00 Helsinki viewed from New York should NOT be 4:00 PM —
    // we just verify that timezone conversion actually happened.
    const result = formatScheduleLocal(2, "16:00", "Europe/Helsinki");

    expect(result.localTime).not.toMatch(/4:00\s*PM/);
    expect(result.tzAbbrev).toMatch(/E[SD]T/);
  });

  it("same-timezone returns the same wall-clock time", () => {
    // Pin local TZ to Helsinki
    pinLocalTimezone("Europe/Helsinki");

    const result = formatScheduleLocal(0, "16:00", "Europe/Helsinki");

    expect(result.localTime).toMatch(/4:00\s*PM/);
  });

  it("maps dayOfWeek=0 to Monday", () => {
    pinLocalTimezone("Europe/Helsinki");

    const result = formatScheduleLocal(0, "12:00", "Europe/Helsinki");

    expect(result.localDay).toBe("Monday");
  });

  it("maps dayOfWeek=6 to Sunday", () => {
    pinLocalTimezone("Europe/Helsinki");

    const result = formatScheduleLocal(6, "12:00", "Europe/Helsinki");

    expect(result.localDay).toBe("Sunday");
  });

  it("maps dayOfWeek=4 to Friday", () => {
    pinLocalTimezone("Europe/Helsinki");

    const result = formatScheduleLocal(4, "12:00", "Europe/Helsinki");

    expect(result.localDay).toBe("Friday");
  });

  it("shifts the day when timezone offset crosses midnight", () => {
    // Pin to a timezone far behind Helsinki
    pinLocalTimezone("Pacific/Honolulu"); // UTC-10

    // Monday 01:00 Helsinki is 12-13 hours behind in Honolulu → previous day
    const result = formatScheduleLocal(0, "01:00", "Europe/Helsinki");

    expect(result.localDay).not.toBe("Monday");
  });

  it("handles midnight start time", () => {
    pinLocalTimezone("Europe/Helsinki");

    const result = formatScheduleLocal(3, "00:00", "Europe/Helsinki");

    expect(result.localTime).toMatch(/12:00\s*AM/);
    expect(result.localDay).toBe("Thursday");
  });

  it("handles end-of-day start time", () => {
    pinLocalTimezone("Europe/Helsinki");

    const result = formatScheduleLocal(1, "23:30", "Europe/Helsinki");

    expect(result.localTime).toMatch(/11:30\s*PM/);
    expect(result.localDay).toBe("Tuesday");
  });
});
