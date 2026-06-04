import { describe, it, expect } from "vitest";
import {
  effectiveStatus,
  pendingHintKey,
  type LifecycleInputs,
  type PendingHintInputs,
} from "@/lib/products/effective-status";

// effectiveStatus is the fact that drives the admin list status pill and
// (eventually) what parents see on browse. Since it derives from stored
// columns rather than a cron, regressions are silent — the column says
// `pending` and the list page displays `pending` even though the start
// date passed two weeks ago. These tests pin the derivation rules.

const NOW = new Date("2026-04-28T12:00:00Z");

function lifecycle(over: Partial<LifecycleInputs>): LifecycleInputs {
  return {
    status: "pending",
    start_date: null,
    end_date: null,
    signup_threshold: null,
    timezone: "Europe/Helsinki",
    ...over,
  };
}

describe("effectiveStatus", () => {
  it("passes through draft and cancelled untouched", () => {
    expect(effectiveStatus(lifecycle({ status: "draft" }), NOW, 0)).toBe(
      "draft",
    );
    expect(
      effectiveStatus(lifecycle({ status: "cancelled" }), NOW, 0),
    ).toBe("cancelled");
  });

  it("passes through completed", () => {
    expect(
      effectiveStatus(lifecycle({ status: "completed" }), NOW, 0),
    ).toBe("completed");
  });

  describe("running → completed", () => {
    it("downgrades running once end_date is in the past", () => {
      const p = lifecycle({ status: "running", end_date: "2026-01-01" });
      expect(effectiveStatus(p, NOW, 0)).toBe("completed");
    });

    it("stays running when end_date is in the future", () => {
      const p = lifecycle({ status: "running", end_date: "2026-12-01" });
      expect(effectiveStatus(p, NOW, 0)).toBe("running");
    });

    it("stays running when end_date is null", () => {
      const p = lifecycle({ status: "running" });
      expect(effectiveStatus(p, NOW, 0)).toBe("running");
    });
  });

  describe("pending — neither date nor threshold", () => {
    it("stays pending forever (admin must manually start)", () => {
      const p = lifecycle({ status: "pending" });
      expect(effectiveStatus(p, NOW, 0)).toBe("pending");
    });

    it("becomes expired if end_date passes (manual start window closed)", () => {
      // No date, no threshold, but end_date is set and has passed.
      // Admin can never manually start now — the window is gone.
      const p = lifecycle({ status: "pending", end_date: "2026-01-01" });
      expect(effectiveStatus(p, NOW, 0)).toBe("expired");
    });
  });

  describe("pending → running upgrade", () => {
    it("upgrades when start_date has passed and there's no threshold", () => {
      const p = lifecycle({ status: "pending", start_date: "2026-01-01" });
      expect(effectiveStatus(p, NOW, 0)).toBe("running");
    });

    it("stays pending when start_date is in the future", () => {
      const p = lifecycle({ status: "pending", start_date: "2026-12-01" });
      expect(effectiveStatus(p, NOW, 0)).toBe("pending");
    });

    it("stays pending until threshold is met (no date set)", () => {
      const p = lifecycle({ status: "pending", signup_threshold: 10 });
      expect(effectiveStatus(p, NOW, 5)).toBe("pending");
      expect(effectiveStatus(p, NOW, 10)).toBe("running");
    });

    it("requires both date AND threshold when both are set", () => {
      const p = lifecycle({
        status: "pending",
        start_date: "2026-01-01", // passed
        signup_threshold: 10,
      });
      expect(effectiveStatus(p, NOW, 5)).toBe("pending");
      expect(effectiveStatus(p, NOW, 10)).toBe("running");
    });

    it("stays pending when threshold met but date hasn't been reached", () => {
      const p = lifecycle({
        status: "pending",
        start_date: "2026-12-01",
        signup_threshold: 10,
      });
      expect(effectiveStatus(p, NOW, 50)).toBe("pending");
    });
  });

  describe("pending → running → completed (skip)", () => {
    it("skips straight to completed when start passed AND end passed AND no threshold", () => {
      const p = lifecycle({
        status: "pending",
        start_date: "2026-01-01",
        end_date: "2026-02-01",
      });
      expect(effectiveStatus(p, NOW, 0)).toBe("completed");
    });

    it("skips to completed when both dates passed AND threshold was met", () => {
      const p = lifecycle({
        status: "pending",
        start_date: "2026-01-01",
        end_date: "2026-02-01",
        signup_threshold: 10,
      });
      expect(effectiveStatus(p, NOW, 10)).toBe("completed");
    });
  });

  describe("pending → expired (start window closed without ever running)", () => {
    it("threshold-bearing product whose start passed and end passed without enough signups → expired", () => {
      // The bug fix case: this used to silently stay "pending" forever.
      const p = lifecycle({
        status: "pending",
        start_date: "2026-01-01",
        end_date: "2026-02-01",
        signup_threshold: 10,
      });
      expect(effectiveStatus(p, NOW, 5)).toBe("expired");
    });

    it("threshold-only product whose end passed without enough signups → expired", () => {
      const p = lifecycle({
        status: "pending",
        end_date: "2026-02-01",
        signup_threshold: 10,
      });
      expect(effectiveStatus(p, NOW, 5)).toBe("expired");
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
        status: "running",
        end_date: "2026-04-28",
      });
      expect(effectiveStatus(p, NOW, 0)).toBe("running");
    });

    it("end_date is past once the next day starts in product TZ", () => {
      // Late evening UTC: 2026-04-28T22:00:00Z = 2026-04-29T01:00 Helsinki
      // (DST). end_date = 2026-04-28 has now passed in Helsinki.
      const lateNight = new Date("2026-04-28T22:00:00Z");
      const p = lifecycle({
        status: "running",
        end_date: "2026-04-28",
      });
      expect(effectiveStatus(p, lateNight, 0)).toBe("completed");
    });

    it("a Pacific-timezone product compared at the same UTC moment is still running today", () => {
      // 2026-04-28T22:00:00Z = 2026-04-28T15:00 Los Angeles. Same calendar
      // day in LA, so end_date=today hasn't passed yet there.
      const lateNight = new Date("2026-04-28T22:00:00Z");
      const p = lifecycle({
        status: "running",
        end_date: "2026-04-28",
        timezone: "America/Los_Angeles",
      });
      expect(effectiveStatus(p, lateNight, 0)).toBe("running");
    });
  });
});

// =============================================================================
// pendingHintKey
// =============================================================================

function pending(over: Partial<PendingHintInputs>): PendingHintInputs {
  return {
    start_date: null,
    signup_threshold: null,
    // registration_opens_at is NOT NULL in the schema; a past timestamp
    // means "open since" and lets the other branches show through.
    registration_opens_at: "1970-01-01T00:00:00Z",
    timezone: "Europe/Helsinki",
    ...over,
  };
}

describe("pendingHintKey", () => {
  it("returns null when nothing is scheduled", () => {
    expect(pendingHintKey(pending({}), NOW)).toBeNull();
  });

  it("registrationOpens takes precedence over future startDate + threshold", () => {
    const p = pending({
      registration_opens_at: "2026-05-01T00:00:00Z",
      start_date: "2026-12-01",
      signup_threshold: 10,
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

  it("future startDate with threshold → dateAndThreshold", () => {
    const p = pending({ start_date: "2026-12-01", signup_threshold: 10 });
    expect(pendingHintKey(p, NOW)).toEqual({
      key: "dateAndThreshold",
      values: { date: "2026-12-01", count: 10 },
    });
  });

  it("future startDate without threshold → startDate", () => {
    const p = pending({ start_date: "2026-12-01" });
    expect(pendingHintKey(p, NOW)).toEqual({
      key: "startDate",
      values: { date: "2026-12-01" },
    });
  });

  it("past startDate with threshold not met → pastDateThreshold", () => {
    const p = pending({ start_date: "2026-01-01", signup_threshold: 10 });
    expect(pendingHintKey(p, NOW)).toEqual({
      key: "pastDateThreshold",
      values: { count: 10 },
    });
  });

  it("threshold-only → threshold", () => {
    const p = pending({ signup_threshold: 10 });
    expect(pendingHintKey(p, NOW)).toEqual({
      key: "threshold",
      values: { count: 10 },
    });
  });

  it("past startDate alone → null (nothing meaningful to say)", () => {
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
