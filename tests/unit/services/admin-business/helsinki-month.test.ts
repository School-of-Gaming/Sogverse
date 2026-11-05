import { describe, expect, it } from "vitest";
import {
  helsinkiMonthOf,
  helsinkiMonthStart,
  recentHelsinkiMonths,
} from "@/services/admin-business/helsinki-month";

describe("Helsinki months", () => {
  it("puts an instant in the month it is in Helsinki, not in UTC", () => {
    // 00:30 on 1 March in Helsinki (EET, UTC+2) is still February in UTC.
    expect(helsinkiMonthOf(new Date("2026-02-28T22:30:00Z"))).toBe("2026-03-01");
    expect(helsinkiMonthOf(new Date("2026-02-28T21:59:59.999Z"))).toBe("2026-02-01");
    // 00:30 on 1 October in Helsinki (EEST, UTC+3).
    expect(helsinkiMonthOf(new Date("2026-09-30T21:30:00Z"))).toBe("2026-10-01");
  });

  it("starts each month at Helsinki midnight in the offset of that date", () => {
    expect(helsinkiMonthStart("2026-03-01").toISOString()).toBe("2026-02-28T22:00:00.000Z");
    // After the spring change: summer time.
    expect(helsinkiMonthStart("2026-04-01").toISOString()).toBe("2026-03-31T21:00:00.000Z");
    // After the autumn change: winter time again.
    expect(helsinkiMonthStart("2026-11-01").toISOString()).toBe("2026-10-31T22:00:00.000Z");
  });

  it("lists the recent months ascending, ending with the one in progress, across a year", () => {
    expect(recentHelsinkiMonths(new Date("2026-02-28T22:30:00Z"), 4)).toEqual([
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });
});
