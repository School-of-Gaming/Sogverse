import { describe, it, expect } from "vitest";
import {
  formatProductSchedule,
  formatWeekday,
  scheduleCardLines,
} from "@/components/public/products/format-product-schedule";
import type { ProductBrowseRow } from "@/types";

// Test fixtures only need the columns the formatter reads. Cast the rest
// rather than inventing dummy values for the entire join.
type Args = Parameters<typeof formatProductSchedule>[0];

function product(over: Partial<ProductBrowseRow>): Args["product"] {
  return {
    product_type: "consumer_club",
    start_date: null,
    end_date: null,
    timezone: "Europe/Helsinki",
    schedule_slots: [],
    ...over,
  } as Args["product"];
}

const HELSINKI = "Europe/Helsinki";
// Stable anchors (a winter Monday and a summer Monday) so next-occurrence
// conversion is deterministic — and lands in a known DST period.
const WINTER_MON = new Date("2026-01-05T12:00:00Z");
const SUMMER_MON = new Date("2026-07-06T12:00:00Z");

// Convenience: defaults to same-zone (viewer == Helsinki) so the conversion is
// an identity and the assertions read as product-local wall clock.
function summary(
  over: Partial<ProductBrowseRow>,
  opts: { locale?: string; timeZone?: string; now?: Date } = {},
) {
  return formatProductSchedule({
    product: product(over),
    locale: opts.locale ?? "en",
    timeZone: opts.timeZone ?? HELSINKI,
    now: opts.now ?? WINTER_MON,
  });
}

describe("formatWeekday", () => {
  it("returns Monday for weekday 0 in en", () => {
    expect(formatWeekday(0, "en")).toBe("Monday");
  });
  it("returns Sunday for weekday 6 in en", () => {
    expect(formatWeekday(6, "en")).toBe("Sunday");
  });
  it("returns Friday in fi for weekday 4", () => {
    expect(formatWeekday(4, "fi").toLowerCase()).toContain("perjantai");
  });
  it("returns short form when requested", () => {
    expect(formatWeekday(0, "en", "short")).toBe("Mon");
  });
});

// ---------------------------------------------------------------------------
// Same-zone passthrough: viewer == product timezone, so conversion is identity
// and the output is the product-local wall clock. tzAdjusted is false.
// ---------------------------------------------------------------------------
describe("formatProductSchedule — same-zone passthrough (clubs)", () => {
  it("single weekday club: one group, long weekday, start–end time, not adjusted", () => {
    const s = summary({
      product_type: "consumer_club",
      schedule_slots: [{ weekday: 0, start_time: "16:00:00", duration_minutes: 90 }],
    });
    expect(s.kind).toBe("recurring");
    if (s.kind !== "recurring") return;
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0]).toMatchObject({
      weekdays: [0],
      weekdaysLabel: "Monday",
      startTime: "16:00",
      endTime: "17:30",
    });
    expect(s.tzAbbrev).toBeTruthy();
    expect(s.tzAdjusted).toBe(false);
  });

  it("multi-weekday same time collapses into one group with short weekday names", () => {
    const s = summary({
      product_type: "consumer_club",
      schedule_slots: [
        { weekday: 2, start_time: "16:00:00", duration_minutes: 90 },
        { weekday: 0, start_time: "16:00:00", duration_minutes: 90 },
      ],
    });
    if (s.kind !== "recurring") throw new Error("expected recurring");
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].weekdays).toEqual([0, 2]);
    expect(s.groups[0].weekdaysLabel).toBe("Mon, Wed");
    expect(s.groups[0].startTime).toBe("16:00");
    expect(s.groups[0].endTime).toBe("17:30");
  });

  it("multi-weekday different times → multiple groups, sorted by earliest weekday", () => {
    const s = summary({
      product_type: "consumer_club",
      schedule_slots: [
        { weekday: 2, start_time: "17:00:00", duration_minutes: 90 },
        { weekday: 0, start_time: "16:00:00", duration_minutes: 90 },
      ],
    });
    if (s.kind !== "recurring") throw new Error("expected recurring");
    expect(s.groups).toHaveLength(2);
    expect(s.groups[0]).toMatchObject({ weekdaysLabel: "Monday", startTime: "16:00", endTime: "17:30" });
    expect(s.groups[1]).toMatchObject({ weekdaysLabel: "Wednesday", startTime: "17:00", endTime: "18:30" });
  });

  it("returns tbd when a club has no schedule slots yet", () => {
    expect(summary({ product_type: "consumer_club", schedule_slots: [] }).kind).toBe("tbd");
  });
});

describe("formatProductSchedule — same-zone passthrough (camps)", () => {
  it("camp: date range + collapsed time group when all days share a time", () => {
    const s = summary({
      product_type: "camp",
      start_date: "2026-06-15",
      end_date: "2026-06-19",
      schedule_slots: [
        { weekday: 0, start_time: "09:00:00", duration_minutes: 360 },
        { weekday: 2, start_time: "09:00:00", duration_minutes: 360 },
        { weekday: 4, start_time: "09:00:00", duration_minutes: 360 },
      ],
    });
    expect(s.kind).toBe("ranged");
    if (s.kind !== "ranged") return;
    expect(s.startDate).toMatch(/Jun/);
    expect(s.endDate).toMatch(/Jun/);
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].weekdaysLabel).toBe("Mon, Wed, Fri");
    expect(s.groups[0].startTime).toBe("09:00");
    expect(s.groups[0].endTime).toBe("15:00");
  });

  it("camp with no slots: ranged with empty groups (date range still useful)", () => {
    const s = summary({
      product_type: "camp",
      start_date: "2026-06-15",
      end_date: "2026-06-19",
      schedule_slots: [],
    });
    if (s.kind !== "ranged") throw new Error("expected ranged");
    expect(s.groups).toEqual([]);
  });

  it("returns tbd when a camp has no start_date", () => {
    expect(summary({ product_type: "camp", start_date: null, end_date: null }).kind).toBe("tbd");
  });

  it("date range is UTC-pinned near a DST boundary (no previous-day slip)", () => {
    const s = summary({
      product_type: "camp",
      start_date: "2026-03-29",
      end_date: "2026-04-02",
    });
    if (s.kind !== "ranged") throw new Error("expected ranged");
    expect(s.startDate).toMatch(/29/);
  });
});

describe("formatProductSchedule — same-zone passthrough (events)", () => {
  it("event with a slot: single date + start/end time from duration", () => {
    const s = summary({
      product_type: "event",
      start_date: "2026-05-04",
      end_date: "2026-05-04",
      schedule_slots: [{ weekday: 5, start_time: "18:00:00", duration_minutes: 120 }],
    });
    expect(s.kind).toBe("single");
    if (s.kind !== "single") return;
    expect(s.date).toMatch(/May/);
    expect(s.time).toEqual({ start: "18:00", end: "20:00" });
    expect(s.tzAdjusted).toBe(false);
  });

  it("event without a slot: date with null time (UTC-pinned, never shifts)", () => {
    const s = summary({
      product_type: "event",
      start_date: "2026-05-04",
      end_date: "2026-05-04",
      schedule_slots: [],
    });
    if (s.kind !== "single") throw new Error("expected single");
    expect(s.time).toBeNull();
    expect(s.date).toMatch(/May/);
  });

  it("event end-time crossing midnight wraps to the next day's clock", () => {
    const s = summary({
      product_type: "event",
      start_date: "2026-05-04",
      end_date: "2026-05-04",
      schedule_slots: [{ weekday: 5, start_time: "23:00:00", duration_minutes: 120 }],
    });
    if (s.kind !== "single") throw new Error("expected single");
    expect(s.time).toEqual({ start: "23:00", end: "01:00" });
  });
});

// ---------------------------------------------------------------------------
// Viewer-timezone conversion: viewer differs from the source (Helsinki) zone.
// ---------------------------------------------------------------------------
describe("formatProductSchedule — viewer-tz conversion", () => {
  it("club weekday SHIFTS forward for a far-east viewer (Helsinki Mon 23:30 → Tokyo Tue)", () => {
    const s = summary(
      {
        product_type: "consumer_club",
        schedule_slots: [{ weekday: 0, start_time: "23:30:00", duration_minutes: 60 }],
      },
      { timeZone: "Asia/Tokyo", now: WINTER_MON },
    );
    if (s.kind !== "recurring") throw new Error("expected recurring");
    expect(s.tzAdjusted).toBe(true);
    expect(s.tzAbbrev).toBe("GMT+9");
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0]).toMatchObject({
      weekdays: [1], // Tuesday in Tokyo
      weekdaysLabel: "Tuesday",
      startTime: "06:30",
      endTime: "07:30",
    });
  });

  it("a same-time Mon/Wed pair stays collapsed after conversion", () => {
    const s = summary(
      {
        product_type: "consumer_club",
        schedule_slots: [
          { weekday: 0, start_time: "16:00:00", duration_minutes: 90 },
          { weekday: 2, start_time: "16:00:00", duration_minutes: 90 },
        ],
      },
      { timeZone: "Asia/Tokyo", now: WINTER_MON },
    );
    if (s.kind !== "recurring") throw new Error("expected recurring");
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].weekdays).toEqual([0, 2]);
    expect(s.groups[0].weekdaysLabel).toBe("Mon, Wed");
    expect(s.groups[0].startTime).toBe("23:00");
  });

  it("tz abbrev reflects the SESSION's DST, not 'now' (EST in winter, EDT in summer)", () => {
    const slots = [{ weekday: 0, start_time: "16:00:00", duration_minutes: 90 }];
    const winter = summary(
      { product_type: "consumer_club", schedule_slots: slots },
      { timeZone: "America/New_York", now: WINTER_MON },
    );
    const summer = summary(
      { product_type: "consumer_club", schedule_slots: slots },
      { timeZone: "America/New_York", now: SUMMER_MON },
    );
    if (winter.kind !== "recurring" || summer.kind !== "recurring") throw new Error("expected recurring");
    expect(winter.tzAbbrev).toBe("EST");
    expect(summer.tzAbbrev).toBe("EDT");
    // Both render 09:00 local (Helsinki and NY shift together across DST).
    expect(winter.groups[0].startTime).toBe("09:00");
    expect(summer.groups[0].startTime).toBe("09:00");
  });

  it("camp date RANGE stays fixed while the daily time converts (and may land on another day)", () => {
    const s = summary(
      {
        product_type: "camp",
        start_date: "2026-06-15",
        end_date: "2026-06-19",
        schedule_slots: [{ weekday: 0, start_time: "09:00:00", duration_minutes: 360 }],
      },
      { timeZone: "Pacific/Honolulu" },
    );
    if (s.kind !== "ranged") throw new Error("expected ranged");
    // Range is UTC-pinned: still 15th–19th regardless of the viewer.
    expect(s.startDate).toMatch(/15/);
    expect(s.endDate).toMatch(/19/);
    expect(s.tzAdjusted).toBe(true);
    expect(s.tzAbbrev).toBe("HST");
    // 09:00 Helsinki → 20:00 the previous day in Honolulu (Sunday).
    expect(s.groups[0].weekdaysLabel).toBe("Sunday");
    expect(s.groups[0].startTime).toBe("20:00");
  });

  it("event date SHIFTS to the next day for a far-east viewer (Helsinki May 4 23:30 → Tokyo May 5)", () => {
    const s = summary(
      {
        product_type: "event",
        start_date: "2026-05-04",
        end_date: "2026-05-04",
        schedule_slots: [{ weekday: 0, start_time: "23:30:00", duration_minutes: 120 }],
      },
      { timeZone: "Asia/Tokyo" },
    );
    if (s.kind !== "single") throw new Error("expected single");
    expect(s.tzAdjusted).toBe(true);
    expect(s.weekday).toBe("Tuesday"); // May 5 2026 is a Tuesday
    expect(s.date).toMatch(/May/);
    expect(s.time).toEqual({ start: "05:30", end: "07:30" });
  });
});

describe("scheduleCardLines — camp weekdays", () => {
  // A camp's card must always name the weekdays it runs: the date range alone
  // doesn't tell a parent which days within it have sessions.
  it("partial-week camp (Mon/Wed/Fri, one time) names its days", () => {
    const s = summary({
      product_type: "camp",
      start_date: "2026-02-23", // Mon
      end_date: "2026-03-06", // Fri, two weeks later
      schedule_slots: [0, 2, 4].map((weekday) => ({
        weekday,
        start_time: "10:00:00",
        duration_minutes: 240,
      })),
    });
    const lines = scheduleCardLines(s);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("Mon, Wed, Fri · 10:00–14:00");
  });

  it("every-weekday camp still names its days (range alone is ambiguous)", () => {
    const s = summary({
      product_type: "camp",
      start_date: "2026-02-23",
      end_date: "2026-02-27",
      schedule_slots: [0, 1, 2, 3, 4].map((weekday) => ({
        weekday,
        start_time: "09:00:00",
        duration_minutes: 360,
      })),
    });
    const lines = scheduleCardLines(s);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("Mon, Tue, Wed, Thu, Fri · 09:00–15:00");
  });
});
