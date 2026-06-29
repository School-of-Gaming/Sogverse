import { describe, it, expect } from "vitest";
import {
  dateTimeInstant,
  nextOccurrenceInstant,
  viewerWeekdayIndex,
} from "@/lib/schedule-occurrence";

const HELSINKI = "Europe/Helsinki";
const WINTER_MON = new Date("2026-01-05T12:00:00Z"); // a Monday, EET (UTC+2)
const SUMMER_MON = new Date("2026-07-06T12:00:00Z"); // a Monday, EEST (UTC+3)

describe("nextOccurrenceInstant", () => {
  it("returns a strictly-future occurrence (now on the target weekday → +7 days)", () => {
    const inst = nextOccurrenceInstant(0, "12:00", HELSINKI, WINTER_MON);
    expect(inst.getTime()).toBeGreaterThan(WINTER_MON.getTime());
    // Next Monday after Jan 5 is Jan 12.
    expect(inst.getUTCMonth()).toBe(0);
    expect(inst.getUTCDate()).toBe(12);
  });

  it("applies the source offset in effect on the occurrence date (DST-correct)", () => {
    // 12:00 Helsinki is 10:00 UTC in winter (EET, UTC+2)...
    expect(nextOccurrenceInstant(0, "12:00", HELSINKI, WINTER_MON).getUTCHours()).toBe(10);
    // ...and 09:00 UTC in summer (EEST, UTC+3).
    expect(nextOccurrenceInstant(0, "12:00", HELSINKI, SUMMER_MON).getUTCHours()).toBe(9);
  });

  it("maps weekday 6 to Sunday in the source zone", () => {
    const inst = nextOccurrenceInstant(6, "12:00", HELSINKI, WINTER_MON);
    expect(viewerWeekdayIndex(inst, HELSINKI)).toBe(6);
    expect(inst.getUTCDate()).toBe(11); // Sunday Jan 11
  });

  it("accepts Postgres HH:MM:SS by ignoring the seconds", () => {
    const a = nextOccurrenceInstant(0, "12:00", HELSINKI, WINTER_MON);
    const b = nextOccurrenceInstant(0, "12:00:00", HELSINKI, WINTER_MON);
    expect(a.getTime()).toBe(b.getTime());
  });
});

describe("dateTimeInstant", () => {
  it("converts a fixed date+time in the source zone to the right UTC instant", () => {
    const inst = dateTimeInstant("2026-01-15", "12:00", HELSINKI);
    expect(inst.getUTCDate()).toBe(15);
    expect(inst.getUTCHours()).toBe(10); // 12:00 EET → 10:00 UTC
  });
});

describe("viewerWeekdayIndex", () => {
  it("returns 0=Mon..6=Sun for an instant as it falls in the zone", () => {
    expect(viewerWeekdayIndex(dateTimeInstant("2026-01-05", "12:00", HELSINKI), HELSINKI)).toBe(0);
    expect(viewerWeekdayIndex(dateTimeInstant("2026-01-11", "12:00", HELSINKI), HELSINKI)).toBe(6);
  });

  it("can land on a different weekday in a different zone", () => {
    // 23:30 Helsinki Monday is already Tuesday in Tokyo.
    const inst = dateTimeInstant("2026-01-12", "23:30", HELSINKI);
    expect(viewerWeekdayIndex(inst, HELSINKI)).toBe(0); // Monday in Helsinki
    expect(viewerWeekdayIndex(inst, "Asia/Tokyo")).toBe(1); // Tuesday in Tokyo
  });
});
