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
});

describe("formatProductSchedule", () => {
  it("consumer_club returns 'every {day} at {time}' with the earliest weekday", () => {
    const line = formatProductSchedule({
      product: product({
        product_type: "consumer_club",
        schedule_slots_v2: [
          { weekday: 3, start_time: "16:00:00", duration_minutes: 60 },
          { weekday: 1, start_time: "17:00:00", duration_minutes: 60 },
        ],
      }),
      locale: "en",
    });
    expect(line.kind).toBe("every");
    if (line.kind === "every") {
      expect(line.day).toBe("Tuesday");
      expect(line.time).toBe("17:00");
      expect(line.tz).toBeTruthy();
    }
  });

  it("camp returns a date range when start_date and end_date are set", () => {
    const line = formatProductSchedule({
      product: product({
        product_type: "camp",
        start_date: "2026-06-15",
        end_date: "2026-06-19",
        schedule_slots_v2: [
          { weekday: 0, start_time: "10:00:00", duration_minutes: 240 },
        ],
      }),
      locale: "en",
    });
    expect(line.kind).toBe("range");
    if (line.kind === "range") {
      expect(line.startDate).toMatch(/Jun/);
      expect(line.endDate).toMatch(/Jun/);
    }
  });

  it("event returns single date + time", () => {
    const line = formatProductSchedule({
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
    expect(line.kind).toBe("single");
    if (line.kind === "single") {
      expect(line.date).toMatch(/May/);
      expect(line.time).toBe("18:00");
    }
  });

  it("returns tbd when consumer_club has no schedule slots yet", () => {
    const line = formatProductSchedule({
      product: product({
        product_type: "consumer_club",
        schedule_slots_v2: [],
      }),
      locale: "en",
    });
    expect(line.kind).toBe("tbd");
  });

  it("returns tbd when camp has no start_date", () => {
    const line = formatProductSchedule({
      product: product({
        product_type: "camp",
        start_date: null,
        end_date: null,
      }),
      locale: "en",
    });
    expect(line.kind).toBe("tbd");
  });

  it("renders dates near a DST boundary without falling onto the previous day", () => {
    // EU DST forward: 28 March 2026, 02:00 → 03:00 (Europe/Helsinki). A
    // start_date of 2026-03-29 should still render as "29 Mar" in en
    // regardless of viewer offset, because we anchor to UTC noon.
    const line = formatProductSchedule({
      product: product({
        product_type: "camp",
        timezone: "Europe/Helsinki",
        start_date: "2026-03-29",
        end_date: "2026-04-02",
      }),
      locale: "en",
    });
    expect(line.kind).toBe("range");
    if (line.kind === "range") {
      expect(line.startDate).toMatch(/29/);
    }
  });
});
