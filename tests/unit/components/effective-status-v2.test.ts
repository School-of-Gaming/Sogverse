import { describe, it, expect } from "vitest";
import {
  effectiveStatus,
  pendingHintKey,
  type LifecycleInputs,
  type PendingHintInputs,
} from "@/components/admin/products-v2/effective-status";

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
    it("upgrades pending straight to completed when start passed and end also passed", () => {
      const p = lifecycle({
        status: "pending",
        start_date: "2026-01-01",
        end_date: "2026-02-01",
      });
      expect(effectiveStatus(p, NOW, 0)).toBe("completed");
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
});
