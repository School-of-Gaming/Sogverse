import { describe, it, expect } from "vitest";
import {
  formatProductSchedule,
  formatWeekday,
} from "@/components/public/products-v2/format-product-schedule";
import type { ProductV2BrowseRow } from "@/types";

// Test fixtures only need the columns the formatter reads. Cast the rest
// rather than inventing dummy values for the entire join.
type Args = Parameters<typeof formatProductSchedule>[0];

function product(over: Partial<ProductV2BrowseRow>): Args["product"] {
  return {
    product_type: "consumer_club",
    start_date: null,
    end_date: null,
    timezone: "Europe/Helsinki",
    schedule_slots_v2: [],
    ...over,
  } as Args["product"];
}

describe("formatWeekday", () => {
  it("returns Monday for weekday 0 in en", () => {
    expect(formatWeekday(0, "en")).toBe("Monday");
  });
  it("returns Sunday for weekday 6 in en", () => {
    expect(formatWeekday(6, "en")).toBe("Sunday");
  });
  it("returns Friday in fi for weekday 4", () => {
    // Finnish weekday names are "perjantai" for Friday — the exact casing
    // depends on Intl, so we just assert it contains the expected stem.
    expect(formatWeekday(4, "fi").toLowerCase()).toContain("perjantai");
  });
  it("returns short form when requested", () => {
    expect(formatWeekday(0, "en", "short")).toBe("Mon");
  });
});

describe("formatProductSchedule — recurring (clubs)", () => {
  it("single weekday club produces one group with the long weekday name and start–end time", () => {
    const summary = formatProductSchedule({
      product: product({
        product_type: "consumer_club",
        schedule_slots_v2: [
          { weekday: 0, start_time: "16:00:00", duration_minutes: 90 },
        ],
      }),
      locale: "en",
    });
    expect(summary.kind).toBe("recurring");
    if (summary.kind !== "recurring") return;
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0]).toMatchObject({
      weekdays: [0],
      weekdaysLabel: "Monday",
      startTime: "16:00",
      endTime: "17:30",
    });
    expect(summary.tz).toBeTruthy();
  });

  it("multi-weekday club with same time collapses into one group with short weekday names", () => {
    const summary = formatProductSchedule({
      product: product({
        product_type: "consumer_club",
        schedule_slots_v2: [
          { weekday: 2, start_time: "16:00:00", duration_minutes: 90 },
          { weekday: 0, start_time: "16:00:00", duration_minutes: 90 },
        ],
      }),
      locale: "en",
    });
    if (summary.kind !== "recurring") throw new Error("expected recurring");
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].weekdays).toEqual([0, 2]);
    expect(summary.groups[0].weekdaysLabel).toBe("Mon, Wed");
    expect(summary.groups[0].startTime).toBe("16:00");
    expect(summary.groups[0].endTime).toBe("17:30");
  });

  it("multi-weekday club with different times produces multiple groups, sorted by earliest weekday", () => {
    const summary = formatProductSchedule({
      product: product({
        product_type: "consumer_club",
        schedule_slots_v2: [
          { weekday: 2, start_time: "17:00:00", duration_minutes: 90 },
          { weekday: 0, start_time: "16:00:00", duration_minutes: 90 },
        ],
      }),
      locale: "en",
    });
    if (summary.kind !== "recurring") throw new Error("expected recurring");
    expect(summary.groups).toHaveLength(2);
    expect(summary.groups[0]).toMatchObject({
      weekdaysLabel: "Monday",
      startTime: "16:00",
      endTime: "17:30",
    });
    expect(summary.groups[1]).toMatchObject({
      weekdaysLabel: "Wednesday",
      startTime: "17:00",
      endTime: "18:30",
    });
  });

  it("returns tbd when consumer_club has no schedule slots yet", () => {
    const summary = formatProductSchedule({
      product: product({
        product_type: "consumer_club",
        schedule_slots_v2: [],
      }),
      locale: "en",
    });
    expect(summary.kind).toBe("tbd");
  });
});

describe("formatProductSchedule — ranged (camps)", () => {
  it("camp returns date range plus collapsed time group when all days share a time", () => {
    const summary = formatProductSchedule({
      product: product({
        product_type: "camp",
        start_date: "2026-06-15",
        end_date: "2026-06-19",
        schedule_slots_v2: [
          { weekday: 0, start_time: "09:00:00", duration_minutes: 360 },
          { weekday: 2, start_time: "09:00:00", duration_minutes: 360 },
          { weekday: 4, start_time: "09:00:00", duration_minutes: 360 },
        ],
      }),
      locale: "en",
    });
    expect(summary.kind).toBe("ranged");
    if (summary.kind !== "ranged") return;
    expect(summary.startDate).toMatch(/Jun/);
    expect(summary.endDate).toMatch(/Jun/);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].weekdaysLabel).toBe("Mon, Wed, Fri");
    expect(summary.groups[0].startTime).toBe("09:00");
    expect(summary.groups[0].endTime).toBe("15:00");
  });

  it("camp with no schedule slots returns ranged with empty groups (date range still useful)", () => {
    const summary = formatProductSchedule({
      product: product({
        product_type: "camp",
        start_date: "2026-06-15",
        end_date: "2026-06-19",
        schedule_slots_v2: [],
      }),
      locale: "en",
    });
    if (summary.kind !== "ranged") throw new Error("expected ranged");
    expect(summary.groups).toEqual([]);
  });

  it("returns tbd when camp has no start_date", () => {
    const summary = formatProductSchedule({
      product: product({
        product_type: "camp",
        start_date: null,
        end_date: null,
      }),
      locale: "en",
    });
    expect(summary.kind).toBe("tbd");
  });

  it("renders dates near a DST boundary without falling onto the previous day", () => {
    // EU DST forward: 28 March 2026, 02:00 → 03:00 (Europe/Helsinki). A
    // start_date of 2026-03-29 should still render as "29 Mar" in en
    // regardless of viewer offset, because we anchor to UTC noon.
    const summary = formatProductSchedule({
      product: product({
        product_type: "camp",
        timezone: "Europe/Helsinki",
        start_date: "2026-03-29",
        end_date: "2026-04-02",
      }),
      locale: "en",
    });
    if (summary.kind !== "ranged") throw new Error("expected ranged");
    expect(summary.startDate).toMatch(/29/);
  });
});

describe("formatProductSchedule — single (events)", () => {
  it("event returns single date with start/end time computed from duration", () => {
    const summary = formatProductSchedule({
      product: product({
        product_type: "event",
        start_date: "2026-05-04",
        end_date: "2026-05-04",
        schedule_slots_v2: [
          { weekday: 5, start_time: "18:00:00", duration_minutes: 120 },
        ],
      }),
      locale: "en",
    });
    expect(summary.kind).toBe("single");
    if (summary.kind !== "single") return;
    expect(summary.date).toMatch(/May/);
    expect(summary.time).toEqual({ start: "18:00", end: "20:00" });
  });

  it("event without a slot returns date with null time", () => {
    const summary = formatProductSchedule({
      product: product({
        product_type: "event",
        start_date: "2026-05-04",
        end_date: "2026-05-04",
        schedule_slots_v2: [],
      }),
      locale: "en",
    });
    if (summary.kind !== "single") throw new Error("expected single");
    expect(summary.time).toBeNull();
  });
});

describe("formatProductSchedule — end-time arithmetic", () => {
  it("a duration that crosses midnight wraps via mod 24h", () => {
    const summary = formatProductSchedule({
      product: product({
        product_type: "event",
        start_date: "2026-05-04",
        end_date: "2026-05-04",
        schedule_slots_v2: [
          { weekday: 5, start_time: "23:00:00", duration_minutes: 120 },
        ],
      }),
      locale: "en",
    });
    if (summary.kind !== "single") throw new Error("expected single");
    expect(summary.time).toEqual({ start: "23:00", end: "01:00" });
  });
});
