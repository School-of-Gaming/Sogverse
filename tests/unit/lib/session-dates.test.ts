import { describe, expect, it } from "vitest";

import {
  firstSessionDate,
  isSessionDay,
  lastSessionDate,
} from "@/lib/session-dates";

// 0 = Monday … 6 = Sunday, the convention `schedule_slots.weekday` uses.
const MON = 0;
const WED = 2;
const FRI = 4;

describe("firstSessionDate", () => {
  it("moves a Monday start onto the Wednesday a Wednesday-only club meets", () => {
    // 2026-08-17 is a Monday.
    expect(firstSessionDate("2026-08-17", [WED])).toBe("2026-08-19");
  });

  it("leaves a start that is already a session day alone", () => {
    expect(firstSessionDate("2026-08-17", [MON, WED])).toBe("2026-08-17");
    expect(firstSessionDate("2026-08-19", [WED])).toBe("2026-08-19");
  });

  it("wraps into the following week when the slot is earlier in the week", () => {
    // Friday 2026-08-21 with a Monday-only club: the next Monday is 2026-08-24.
    expect(firstSessionDate("2026-08-21", [MON])).toBe("2026-08-24");
  });

  it("passes the date through when there are no slots", () => {
    expect(firstSessionDate("2026-08-17", [])).toBe("2026-08-17");
  });
});

describe("lastSessionDate", () => {
  it("pulls a Sunday end back onto the last Wednesday", () => {
    // 2026-12-13 is a Sunday; the Wednesday before it is 2026-12-09.
    expect(lastSessionDate("2026-12-13", [WED])).toBe("2026-12-09");
  });

  it("leaves an end that is already a session day alone", () => {
    expect(lastSessionDate("2026-12-09", [WED])).toBe("2026-12-09");
    expect(lastSessionDate("2026-12-11", [WED, FRI])).toBe("2026-12-11");
  });

  it("passes the date through when there are no slots", () => {
    expect(lastSessionDate("2026-12-13", [])).toBe("2026-12-13");
  });
});

describe("isSessionDay", () => {
  it("is true on a meeting day and false otherwise", () => {
    expect(isSessionDay("2026-08-19", [WED])).toBe(true);
    expect(isSessionDay("2026-08-17", [WED])).toBe(false);
    expect(isSessionDay("2026-08-17", [MON, WED])).toBe(true);
  });

  it("is true when there are no slots to check against", () => {
    expect(isSessionDay("2026-08-17", [])).toBe(true);
  });
});
