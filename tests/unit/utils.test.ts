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
  it("formats USD by default", () => {
    expect(formatCurrency(29.99)).toBe("$29.99");
  });

  it("formats USD explicitly", () => {
    expect(formatCurrency(29.99, "usd")).toBe("$29.99");
  });

  it("formats GBP with pound sign", () => {
    const result = formatCurrency(100, "gbp");
    expect(result).toContain("£");
    expect(result).toContain("100");
  });

  it("formats EUR with euro sign", () => {
    const result = formatCurrency(100, "eur");
    expect(result).toContain("€");
    expect(result).toContain("100");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("handles large numbers", () => {
    expect(formatCurrency(1000000)).toBe("$1,000,000.00");
  });
});

describe("formatCurrencyFromCents", () => {
  it("converts cents to formatted USD", () => {
    expect(formatCurrencyFromCents(1500)).toBe("$15.00");
  });

  it("converts cents to formatted GBP", () => {
    const result = formatCurrencyFromCents(1200, "gbp");
    expect(result).toContain("£");
    expect(result).toContain("12.00");
  });

  it("converts cents to formatted EUR", () => {
    const result = formatCurrencyFromCents(1400, "eur");
    expect(result).toContain("€");
    expect(result).toContain("14.00");
  });

  it("handles zero cents", () => {
    expect(formatCurrencyFromCents(0)).toBe("$0.00");
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
   */
  function pinLocalTimezone(tz: string) {
    const Original = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function (
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      // If the caller didn't specify a timeZone, inject our pinned TZ
      if (options && !options.timeZone) {
        return new Original(locale, { ...options, timeZone: tz });
      }
      return new Original(locale, options);
    } as typeof Intl.DateTimeFormat;
    // Preserve static methods
    Intl.DateTimeFormat.supportedLocalesOf = Original.supportedLocalesOf;
  }

  it("returns a valid day name, formatted time, and timezone abbreviation", () => {
    const result = formatScheduleLocal(0, "16:00", "Europe/Helsinki");

    // Should return recognizable values regardless of local TZ
    expect(typeof result.localDay).toBe("string");
    expect(result.localDay.length).toBeGreaterThan(0);
    expect(result.localTime).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/);
    expect(typeof result.tzAbbrev).toBe("string");
  });

  it("handles HH:MM:SS format (DB returns seconds)", () => {
    const result = formatScheduleLocal(2, "17:30:00", "Europe/Helsinki");

    expect(result.localTime).toMatch(/\d{1,2}:\d{2}\s*(AM|PM)/);
  });

  it("converts Helsinki time to US Eastern correctly", () => {
    // Pin local TZ to America/New_York
    pinLocalTimezone("America/New_York");

    // Wednesday 16:00 Helsinki → either 9:00 AM or 8:00 AM Eastern depending on DST
    // Helsinki is UTC+2 (winter) or UTC+3 (summer)
    // New York is UTC-5 (winter) or UTC-4 (summer)
    // Difference is always 7 hours
    const result = formatScheduleLocal(2, "16:00", "Europe/Helsinki");

    // 16:00 Helsinki → 9:00 AM ET (summer: +3 vs -4 = 7h) or 8:00 AM ET (winter: +2 vs -5 = 7h)
    // Either way the difference is 7 hours
    expect(result.localTime).toMatch(/[89]:00\s*(AM)/);
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

  it("handles timezone offset that crosses midnight (day shift)", () => {
    // Pin to a timezone far behind Helsinki
    pinLocalTimezone("Pacific/Honolulu"); // UTC-10

    // Monday 01:00 Helsinki → Helsinki is UTC+2 (winter) or UTC+3 (summer)
    // Honolulu is always UTC-10 (no DST)
    // Difference is 12-13 hours behind → previous day
    const result = formatScheduleLocal(0, "01:00", "Europe/Helsinki");

    // 01:00 Helsinki → the previous day in Honolulu
    expect(result.localDay).toBe("Sunday");
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
