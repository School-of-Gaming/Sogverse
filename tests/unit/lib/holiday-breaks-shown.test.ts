import { describe, it, expect } from "vitest";
import { holidayBreakRows } from "@/lib/holiday-breaks";
import {
  holidayBreakLines,
  holidayBreaksSpan,
  shownHolidayBreaks,
} from "@/lib/products/holiday-breaks-shown";
import { formatCompactDateRange } from "@/lib/utils";

/**
 * The compact bare-date range every holiday list draws, and the rule deciding
 * which of a club's breaks those lists show.
 */

describe("formatCompactDateRange", () => {
  const TODAY = "2026-10-12";

  it("collapses a range inside one month to its days", () => {
    expect(formatCompactDateRange("2026-10-19", "2026-10-23", "fr", TODAY)).toBe(
      "19–23 oct.",
    );
  });

  it("names both months across a month boundary", () => {
    expect(formatCompactDateRange("2026-10-26", "2026-11-03", "fr", TODAY)).toBe(
      "26 oct. – 3 nov.",
    );
  });

  it("carries the year when the range crosses one", () => {
    expect(formatCompactDateRange("2026-12-21", "2027-01-06", "fr", TODAY)).toBe(
      "21 déc. 2026 – 6 janv. 2027",
    );
  });

  it("carries the year when the range is not in the current one", () => {
    expect(formatCompactDateRange("2027-02-22", "2027-02-26", "fr", TODAY)).toBe(
      "22–26 févr. 2027",
    );
  });

  it("names one date for a one-day break", () => {
    expect(formatCompactDateRange("2026-12-24", "2026-12-24", "fr", TODAY)).toBe(
      "24 déc.",
    );
  });

  it("writes each locale's own compact form", () => {
    expect(formatCompactDateRange("2026-10-19", "2026-10-23", "fi", TODAY)).toBe(
      "19.–23.10.",
    );
    expect(formatCompactDateRange("2026-10-19", "2026-10-23", "sv", TODAY)).toBe(
      "19–23 okt.",
    );
    // Bare `en` is US English in `Intl`, like every other date the app renders.
    expect(formatCompactDateRange("2026-10-19", "2026-10-23", "en", TODAY)).toBe(
      "Oct 19 – 23",
    );
  });

  it("is pinned to UTC, whatever the runtime's zone", () => {
    // A zone east of UTC would tip a midnight-parsed date the other way.
    expect(formatCompactDateRange("2026-01-01", "2026-01-01", "fr", TODAY)).toBe(
      "1 janv.",
    );
  });
});

/** One break as `holiday_breaks_document` emits it, parsed as the app reads it. */
function breaks(
  rows: { id: string; from: string; to: string; withdrew?: boolean; names?: { locale: string; name: string }[] }[],
) {
  return holidayBreakRows.parse(
    rows.map(({ id, from, to, withdrew = true, names }) => ({
      id,
      start_date: from,
      end_date: to,
      names: names ?? [{ locale: "en", name: `Break ${id}` }],
      withdrawn_sessions: withdrew
        ? [{ session_date: from, starts_at: `${from}T13:00:00Z`, ends_at: `${from}T14:00:00Z` }]
        : [],
    })),
  );
}

describe("holidayBreaksSpan", () => {
  const NOW = new Date("2026-10-11T22:30:00Z"); // already the 12th in Helsinki

  it("reads a dated club over its term", () => {
    expect(
      holidayBreaksSpan(
        { product_type: "consumer_club", start_date: "2026-08-10", end_date: "2026-12-18", timezone: "Europe/Helsinki" },
        NOW,
      ),
    ).toEqual({ from: "2026-08-10", to: "2026-12-18" });
  });

  it("reads an open-ended club from product-local today a year and a day ahead", () => {
    expect(
      holidayBreaksSpan(
        { product_type: "municipality_club", start_date: "2026-08-10", end_date: null, timezone: "Europe/Helsinki" },
        NOW,
      ),
    ).toEqual({ from: "2026-10-12", to: "2027-10-13" });
  });

  it("reads nothing for a product that is not a club", () => {
    for (const product_type of ["camp", "event"] as const) {
      expect(
        holidayBreaksSpan(
          { product_type, start_date: "2026-08-10", end_date: "2026-08-14", timezone: "Europe/Helsinki" },
          NOW,
        ),
      ).toBeNull();
    }
  });
});

describe("shownHolidayBreaks", () => {
  const TODAY = "2026-10-12";

  it("shows every break of a dated club that took a session, and none that took none", () => {
    const rows = breaks([
      { id: "a", from: "2026-08-24", to: "2026-08-28" },
      { id: "b", from: "2026-09-04", to: "2026-09-04", withdrew: false },
      { id: "c", from: "2026-10-19", to: "2026-10-23" },
    ]);
    expect(shownHolidayBreaks(rows, "2026-12-18", TODAY).map((row) => row.id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("shows an open-ended club the next three breaks ending on or after today", () => {
    const rows = breaks([
      { id: "past", from: "2026-10-05", to: "2026-10-09" },
      { id: "now", from: "2026-10-12", to: "2026-10-16" },
      { id: "skip", from: "2026-11-02", to: "2026-11-02", withdrew: false },
      { id: "xmas", from: "2026-12-21", to: "2027-01-06" },
      { id: "winter", from: "2027-02-22", to: "2027-02-26" },
      { id: "easter", from: "2027-03-26", to: "2027-03-29" },
    ]);
    expect(shownHolidayBreaks(rows, null, TODAY).map((row) => row.id)).toEqual([
      "now",
      "xmas",
      "winter",
    ]);
  });

  it("shows nothing when no break took a session", () => {
    expect(
      shownHolidayBreaks(breaks([{ id: "a", from: "2026-10-19", to: "2026-10-23", withdrew: false }]), null, TODAY),
    ).toEqual([]);
  });
});

describe("holidayBreakLines", () => {
  it("names each break in the reader's locale, else English, else the first written", () => {
    const rows = breaks([
      { id: "a", from: "2026-10-19", to: "2026-10-23", names: [{ locale: "en", name: "Autumn break" }, { locale: "fi", name: "Syysloma" }] },
      { id: "b", from: "2026-12-21", to: "2027-01-06", names: [{ locale: "en", name: "Christmas break" }, { locale: "sv", name: "Jullov" }] },
      { id: "c", from: "2027-02-22", to: "2027-02-26", names: [{ locale: "sv", name: "Sportlov" }] },
    ]);
    expect(
      holidayBreakLines(rows, { endDate: null, today: "2026-10-12", locale: "fi" }),
    ).toEqual([
      { id: "a", name: "Syysloma", range: "19.–23.10." },
      { id: "b", name: "Christmas break", range: formatCompactDateRange("2026-12-21", "2027-01-06", "fi", "2026-10-12") },
      { id: "c", name: "Sportlov", range: "22.–26.2.2027" },
    ]);
  });
});
