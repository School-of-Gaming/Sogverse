import { describe, it, expect } from "vitest";
import {
  effectiveStatus,
  pendingHintKey,
  type LifecycleInputs,
  type PendingHintInputs,
} from "@/lib/products/effective-status";

// effectiveStatus is the fact that drives the admin list status pill and what
// parents see on browse. There is no stored status behind it: the answer is a
// function of the two dates, so a regression here is a page saying "awaiting
// start" about a club that began two weeks ago, with nothing anywhere to
// contradict it. These tests pin the derivation rules.

const NOW = new Date("2026-04-28T12:00:00Z");

function lifecycle(over: Partial<LifecycleInputs>): LifecycleInputs {
  return {
    start_date: "2026-01-01",
    end_date: null,
    timezone: "Europe/Helsinki",
    ...over,
  };
}

describe("effectiveStatus", () => {
  describe("a run that has begun", () => {
    it("is running while end_date is in the future", () => {
      const p = lifecycle({ start_date: "2026-01-01", end_date: "2026-12-01" });
      expect(effectiveStatus(p, NOW)).toBe("running");
    });

    it("is running indefinitely when end_date is null", () => {
      const p = lifecycle({ start_date: "2026-01-01" });
      expect(effectiveStatus(p, NOW)).toBe("running");
    });

    it("is completed once end_date is in the past", () => {
      const p = lifecycle({ start_date: "2026-01-01", end_date: "2026-02-01" });
      expect(effectiveStatus(p, NOW)).toBe("completed");
    });
  });

  describe("pending → running", () => {
    it("runs once start_date has passed", () => {
      const p = lifecycle({ start_date: "2026-01-01" });
      expect(effectiveStatus(p, NOW)).toBe("running");
    });

    it("stays pending while start_date is in the future", () => {
      const p = lifecycle({ start_date: "2026-12-01" });
      expect(effectiveStatus(p, NOW)).toBe("pending");
    });

    it("runs on the start date itself", () => {
      const p = lifecycle({ start_date: "2026-04-28" });
      expect(effectiveStatus(p, NOW)).toBe("running");
    });
  });

  describe("pending → running → completed (skip)", () => {
    it("skips straight to completed when both dates have passed", () => {
      const p = lifecycle({
        start_date: "2026-01-01",
        end_date: "2026-02-01",
      });
      expect(effectiveStatus(p, NOW)).toBe("completed");
    });
  });

  describe("timezone-correct date comparisons", () => {
    // start_date and end_date are date-only strings; they're compared
    // against `now` projected into the product's timezone, not UTC.
    it("an event ending today stays running through end-of-day in product TZ", () => {
      // Helsinki is UTC+2 in winter / UTC+3 in summer. 2026-04-28T12:00:00Z
      // is afternoon in Helsinki — same calendar day. So end_date=today
      // (2026-04-28) has NOT yet passed.
      const p = lifecycle({
        start_date: "2026-01-01",
        end_date: "2026-04-28",
      });
      expect(effectiveStatus(p, NOW)).toBe("running");
    });

    it("end_date is past once the next day starts in product TZ", () => {
      // Late evening UTC: 2026-04-28T22:00:00Z = 2026-04-29T01:00 Helsinki
      // (DST). end_date = 2026-04-28 has now passed in Helsinki.
      const lateNight = new Date("2026-04-28T22:00:00Z");
      const p = lifecycle({
        start_date: "2026-01-01",
        end_date: "2026-04-28",
      });
      expect(effectiveStatus(p, lateNight)).toBe("completed");
    });

    it("start_date has arrived on the product's own calendar day, not the reader's", () => {
      // 2026-06-14T22:00:00Z is already the 15th in Helsinki (UTC+3 in
      // summer) and still the 14th in Los Angeles, so at one instant the
      // same start date has arrived for one product and not for the other.
      const midnightish = new Date("2026-06-14T22:00:00Z");
      const p = lifecycle({ start_date: "2026-06-15" });
      expect(effectiveStatus(p, midnightish)).toBe("running");
      expect(
        effectiveStatus({ ...p, timezone: "America/Los_Angeles" }, midnightish),
      ).toBe("pending");
    });

    it("a Pacific-timezone product compared at the same UTC moment is still running today", () => {
      // 2026-04-28T22:00:00Z = 2026-04-28T15:00 Los Angeles. Same calendar
      // day in LA, so end_date=today hasn't passed yet there.
      const lateNight = new Date("2026-04-28T22:00:00Z");
      const p = lifecycle({
        start_date: "2026-01-01",
        end_date: "2026-04-28",
        timezone: "America/Los_Angeles",
      });
      expect(effectiveStatus(p, lateNight)).toBe("running");
    });
  });
});

// =============================================================================
// pendingHintKey
// =============================================================================

function pending(over: Partial<PendingHintInputs>): PendingHintInputs {
  return {
    start_date: "2026-01-01",
    // registration_opens_at is NOT NULL in the schema; a past timestamp
    // means "open since" and lets the other branch show through.
    registration_opens_at: "1970-01-01T00:00:00Z",
    timezone: "Europe/Helsinki",
    ...over,
  };
}

describe("pendingHintKey", () => {
  it("registrationOpens takes precedence over a future startDate", () => {
    const p = pending({
      registration_opens_at: "2026-05-01T00:00:00Z",
      start_date: "2026-12-01",
    });
    expect(pendingHintKey(p, NOW)).toEqual({
      key: "registrationOpens",
      values: { date: "2026-05-01T00:00:00Z" },
    });
  });

  it("does NOT report registrationOpens once the open date has passed", () => {
    const p = pending({
      registration_opens_at: "2026-01-01T00:00:00Z",
      start_date: "2026-12-01",
    });
    expect(pendingHintKey(p, NOW)).toEqual({
      key: "startDate",
      values: { date: "2026-12-01" },
    });
  });

  it("future startDate → startDate", () => {
    const p = pending({ start_date: "2026-12-01" });
    expect(pendingHintKey(p, NOW)).toEqual({
      key: "startDate",
      values: { date: "2026-12-01" },
    });
  });

  it("past startDate → null (nothing meaningful to say)", () => {
    const p = pending({ start_date: "2026-01-01" });
    expect(pendingHintKey(p, NOW)).toBeNull();
  });

  it("compares startDate against the product's local calendar day, not UTC", () => {
    // 2026-04-28T22:00Z = 2026-04-29 in Helsinki. start_date=2026-04-29
    // is "today" in Helsinki, not in the future, so → null (no hint).
    const lateNight = new Date("2026-04-28T22:00:00Z");
    const p = pending({ start_date: "2026-04-29" });
    expect(pendingHintKey(p, lateNight)).toBeNull();
  });
});
