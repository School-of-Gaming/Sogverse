import { describe, expect, it } from "vitest";

import {
  isoWeekEnd,
  isoWeekOf,
  isoWeekStart,
  isoWeeksBetween,
  isoWeeksInYear,
  parseIsoWeekInput,
} from "@/lib/iso-week";

describe("isoWeekOf", () => {
  it("numbers an ordinary mid-year date", () => {
    // 2026-08-17 is a Monday; 2026-W01 starts 2025-12-29, so this is 34 weeks on.
    expect(isoWeekOf("2026-08-17")).toEqual({ isoYear: 2026, week: 34 });
    // The Sunday that closes the same week.
    expect(isoWeekOf("2026-08-23")).toEqual({ isoYear: 2026, week: 34 });
  });

  it("puts 1 January in week 1 when it is a Thursday", () => {
    expect(isoWeekOf("2026-01-01")).toEqual({ isoYear: 2026, week: 1 });
  });

  it("puts 31 December in week 53 when it is a Thursday", () => {
    expect(isoWeekOf("2026-12-31")).toEqual({ isoYear: 2026, week: 53 });
  });

  it("keeps early January in the previous ISO year", () => {
    // Sunday 2027-01-03 closes the week whose Thursday is 2026-12-31.
    expect(isoWeekOf("2027-01-03")).toEqual({ isoYear: 2026, week: 53 });
    // Sunday 2021-01-03 closes the week whose Thursday is 2020-12-31.
    expect(isoWeekOf("2021-01-03")).toEqual({ isoYear: 2020, week: 53 });
  });

  it("starts the new ISO year on the Monday after", () => {
    expect(isoWeekOf("2027-01-04")).toEqual({ isoYear: 2027, week: 1 });
  });

  it("pulls late December into week 1 of the next ISO year", () => {
    // Monday 2024-12-30's Thursday is 2025-01-02, so the week is numbered 2025.
    expect(isoWeekOf("2024-12-30")).toEqual({ isoYear: 2025, week: 1 });
  });
});

describe("isoWeeksInYear", () => {
  it("reports 53 for the long years", () => {
    expect(isoWeeksInYear(2020)).toBe(53);
    expect(isoWeeksInYear(2026)).toBe(53);
  });

  it("reports 52 for the short years", () => {
    expect(isoWeeksInYear(2025)).toBe(52);
    expect(isoWeeksInYear(2027)).toBe(52);
  });
});

describe("isoWeekStart / isoWeekEnd", () => {
  it("spans Monday to Sunday", () => {
    expect(isoWeekStart({ isoYear: 2026, week: 34 })).toBe("2026-08-17");
    expect(isoWeekEnd({ isoYear: 2026, week: 34 })).toBe("2026-08-23");
  });

  it("lets week 1 start in the previous calendar year", () => {
    expect(isoWeekStart({ isoYear: 2026, week: 1 })).toBe("2025-12-29");
    expect(isoWeekEnd({ isoYear: 2026, week: 1 })).toBe("2026-01-04");
  });

  it("lets week 53 end in the next calendar year", () => {
    expect(isoWeekStart({ isoYear: 2026, week: 53 })).toBe("2026-12-28");
    expect(isoWeekEnd({ isoYear: 2026, week: 53 })).toBe("2027-01-03");
  });

  it("round-trips through isoWeekOf across the year boundary", () => {
    const weeks = [
      { isoYear: 2020, week: 53 },
      { isoYear: 2025, week: 1 },
      { isoYear: 2025, week: 52 },
      { isoYear: 2026, week: 1 },
      { isoYear: 2026, week: 53 },
      { isoYear: 2027, week: 1 },
    ];
    for (const week of weeks) {
      expect(isoWeekOf(isoWeekStart(week))).toEqual(week);
      expect(isoWeekOf(isoWeekEnd(week))).toEqual(week);
    }
  });
});

describe("isoWeeksBetween", () => {
  it("counts an autumn term inclusively", () => {
    // Monday 2026-08-17 (W34) to Friday 2026-12-11 (W50).
    expect(isoWeeksBetween("2026-08-17", "2026-12-11")).toBe(17);
  });

  it("counts a span inside one week as one", () => {
    expect(isoWeeksBetween("2026-08-17", "2026-08-23")).toBe(1);
    expect(isoWeeksBetween("2026-08-19", "2026-08-19")).toBe(1);
  });

  it("counts across the ISO year boundary", () => {
    // W52 2026, W53 2026, W01 2027.
    expect(isoWeeksBetween("2026-12-21", "2027-01-04")).toBe(3);
  });

  it("returns 0 when the end precedes the start", () => {
    expect(isoWeeksBetween("2026-08-19", "2026-08-18")).toBe(0);
  });
});

describe("parseIsoWeekInput", () => {
  it("accepts every shorthand spelling", () => {
    const expected = { isoYear: 2026, week: 34 };
    for (const text of [
      "34",
      "vk 34",
      "vk34",
      "wk34",
      "wk 34",
      "v. 34",
      "v.34",
      "v 34",
      "S34",
      "s 34",
      "W34",
      "w34",
      "  34  ",
      "  VK 34 ",
    ]) {
      expect(parseIsoWeekInput(text, 2026)).toEqual(expected);
    }
  });

  it("accepts the full ISO designator and ignores the default year", () => {
    expect(parseIsoWeekInput("2026-W34", 2020)).toEqual({
      isoYear: 2026,
      week: 34,
    });
    expect(parseIsoWeekInput("2026W34", 2020)).toEqual({
      isoYear: 2026,
      week: 34,
    });
    expect(parseIsoWeekInput(" 2026-w34 ", 2020)).toEqual({
      isoYear: 2026,
      week: 34,
    });
  });

  it("takes the default year for a bare number", () => {
    expect(parseIsoWeekInput("1", 2027)).toEqual({ isoYear: 2027, week: 1 });
  });

  it("bounds week 53 by the resolved year", () => {
    expect(parseIsoWeekInput("53", 2026)).toEqual({ isoYear: 2026, week: 53 });
    expect(parseIsoWeekInput("53", 2025)).toBeNull();
    expect(parseIsoWeekInput("2026-W53", 2025)).toEqual({
      isoYear: 2026,
      week: 53,
    });
    expect(parseIsoWeekInput("2025-W53", 2026)).toBeNull();
  });

  it("rejects nonsense, zero and out-of-range weeks", () => {
    for (const text of [
      "",
      "   ",
      "0",
      "00",
      "54",
      "99",
      "week 34",
      "34a",
      "-34",
      "3.4",
      "vk",
      "2026-W",
      "202-W34",
    ]) {
      expect(parseIsoWeekInput(text, 2026)).toBeNull();
    }
  });
});
