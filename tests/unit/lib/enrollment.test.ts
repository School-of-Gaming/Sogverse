import { describe, it, expect } from "vitest";
import {
  getNextSessionStart,
  isWithinChargeWindow,
  getRefundEligibility,
  formatCountdown,
} from "@/lib/enrollment";

// All tests use explicit `now` to be deterministic.
// Timezone "UTC" simplifies reasoning — wall-clock === UTC.

describe("getNextSessionStart", () => {
  it("returns next occurrence when today is before the target day", () => {
    // Wednesday 2026-02-25 12:00 UTC. Target: Friday (dayOfWeek=4)
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getNextSessionStart(4, "15:00", "UTC", now);

    // Next Friday is 2026-02-27 at 15:00 UTC
    expect(result.toISOString()).toBe("2026-02-27T15:00:00.000Z");
  });

  it("returns today if session is later today", () => {
    // Wednesday 2026-02-25 10:00 UTC. Target: Wednesday (dayOfWeek=2), 15:00
    const now = new Date("2026-02-25T10:00:00Z");
    const result = getNextSessionStart(2, "15:00", "UTC", now);

    expect(result.toISOString()).toBe("2026-02-25T15:00:00.000Z");
  });

  it("skips to next week if session already passed today", () => {
    // Wednesday 2026-02-25 16:00 UTC. Target: Wednesday 15:00
    const now = new Date("2026-02-25T16:00:00Z");
    const result = getNextSessionStart(2, "15:00", "UTC", now);

    // Next Wednesday is 2026-03-04
    expect(result.toISOString()).toBe("2026-03-04T15:00:00.000Z");
  });

  it("handles Sunday (dayOfWeek=6)", () => {
    // Wednesday 2026-02-25 12:00 UTC. Target: Sunday (dayOfWeek=6)
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getNextSessionStart(6, "10:00", "UTC", now);

    // Next Sunday is 2026-03-01
    expect(result.toISOString()).toBe("2026-03-01T10:00:00.000Z");
  });

  it("handles Monday (dayOfWeek=0)", () => {
    // Wednesday 2026-02-25 12:00 UTC. Target: Monday (dayOfWeek=0)
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getNextSessionStart(0, "09:00", "UTC", now);

    // Next Monday is 2026-03-02
    expect(result.toISOString()).toBe("2026-03-02T09:00:00.000Z");
  });

  it("converts wall-clock time from a different timezone to UTC", () => {
    // Wednesday 2026-02-25 12:00 UTC. Session: Friday 15:00 Europe/Helsinki (UTC+2)
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getNextSessionStart(4, "15:00", "Europe/Helsinki", now);

    // Friday 15:00 Helsinki = Friday 13:00 UTC → 2026-02-27T13:00:00Z
    expect(result.toISOString()).toBe("2026-02-27T13:00:00.000Z");
  });

  it("handles US timezone offset correctly", () => {
    // Wednesday 2026-02-25 12:00 UTC. Session: Thursday 10:00 America/New_York (UTC-5 in Feb)
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getNextSessionStart(3, "10:00", "America/New_York", now);

    // Thursday 10:00 EST = Thursday 15:00 UTC → 2026-02-26T15:00:00Z
    expect(result.toISOString()).toBe("2026-02-26T15:00:00.000Z");
  });

  it("handles day boundary: session local day differs from UTC day (positive offset)", () => {
    // "now" is Wed 2026-02-25 20:00 UTC = Thu 2026-02-26 05:00 JST.
    // Session: Wednesday 01:00 Asia/Tokyo (UTC+9) → Wednesday 01:00 JST = Tuesday 16:00 UTC.
    // In JST it's already Thursday, so next Wednesday = March 4 JST.
    // March 4 01:00 JST = March 3 16:00 UTC.
    const now = new Date("2026-02-25T20:00:00Z");
    const result = getNextSessionStart(2, "01:00", "Asia/Tokyo", now);

    expect(result.toISOString()).toBe("2026-03-03T16:00:00.000Z");
  });

  it("handles day boundary: session local day differs from UTC day (negative offset)", () => {
    // Wednesday 2026-02-25 02:00 UTC. Session: Tuesday 22:00 America/Chicago (UTC-6 in Feb).
    // Tuesday 22:00 CST = Wednesday 04:00 UTC.
    // "now" is Wed 02:00 UTC = Tue 20:00 CST. Session is later today (Tue CST, 22:00 > 20:00).
    const now = new Date("2026-02-25T02:00:00Z"); // Tue 20:00 CST
    const result = getNextSessionStart(1, "22:00", "America/Chicago", now);

    // Tue 22:00 CST = Wed 04:00 UTC → 2026-02-25T04:00:00Z (still "today" in CST)
    expect(result.toISOString()).toBe("2026-02-25T04:00:00.000Z");
  });

  it("handles DST transition: spring forward (US)", () => {
    // 2026 US DST spring forward: March 8, 2:00 AM → 3:00 AM.
    // Session: Sunday 10:00 America/New_York (dayOfWeek=6).
    // On March 8 (DST day), 10:00 EDT = 14:00 UTC (offset is -4, not -5).
    const now = new Date("2026-03-07T12:00:00Z"); // Saturday before DST
    const result = getNextSessionStart(6, "10:00", "America/New_York", now);

    // Sunday March 8, 10:00 EDT (post-spring-forward) = 14:00 UTC
    expect(result.toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });

  it("handles DST transition: fall back (EU)", () => {
    // 2026 EU DST fall back: October 25, 3:00 AM → 2:00 AM (Europe/Helsinki, UTC+3 → UTC+2).
    // Session: Sunday 15:00 Europe/Helsinki (dayOfWeek=6).
    // On Oct 25, 15:00 EET (post-fallback) = 13:00 UTC (offset is +2, not +3).
    const now = new Date("2026-10-24T12:00:00Z"); // Saturday before fallback
    const result = getNextSessionStart(6, "15:00", "Europe/Helsinki", now);

    // Sunday Oct 25, 15:00 EET = 13:00 UTC
    expect(result.toISOString()).toBe("2026-10-25T13:00:00.000Z");
  });

  it("cron scenario: hourly check finds session within charge window", () => {
    // Product: Friday 15:00 Europe/Helsinki (UTC+2 in Feb) → Friday 13:00 UTC.
    // Cron runs Thursday 13:00 UTC → exactly 24h before session → within window.
    const cronNow = new Date("2026-02-26T13:00:00Z"); // Thursday 13:00 UTC
    const nextSession = getNextSessionStart(4, "15:00", "Europe/Helsinki", cronNow);

    expect(nextSession.toISOString()).toBe("2026-02-27T13:00:00.000Z");
    expect(isWithinChargeWindow(nextSession, 24, cronNow)).toBe(true);
  });

  it("cron scenario: hourly check finds session outside charge window", () => {
    // Product: Friday 15:00 Europe/Helsinki → Friday 13:00 UTC.
    // Cron runs Thursday 12:00 UTC → 25h before → outside 24h window.
    const cronNow = new Date("2026-02-26T12:00:00Z"); // Thursday 12:00 UTC
    const nextSession = getNextSessionStart(4, "15:00", "Europe/Helsinki", cronNow);

    expect(nextSession.toISOString()).toBe("2026-02-27T13:00:00.000Z");
    expect(isWithinChargeWindow(nextSession, 24, cronNow)).toBe(false);
  });
});

describe("isWithinChargeWindow", () => {
  it("returns false when session is far in the future", () => {
    const nextSession = new Date("2026-03-01T15:00:00Z");
    const now = new Date("2026-02-25T12:00:00Z"); // 4+ days away

    expect(isWithinChargeWindow(nextSession, 24, now)).toBe(false);
  });

  it("returns true when exactly at the window boundary", () => {
    const nextSession = new Date("2026-02-26T12:00:00Z");
    const now = new Date("2026-02-25T12:00:00Z"); // exactly 24h before

    expect(isWithinChargeWindow(nextSession, 24, now)).toBe(true);
  });

  it("returns true when within the window", () => {
    const nextSession = new Date("2026-02-26T12:00:00Z");
    const now = new Date("2026-02-26T10:00:00Z"); // 2h before

    expect(isWithinChargeWindow(nextSession, 24, now)).toBe(true);
  });

  it("returns false when just outside the window", () => {
    const nextSession = new Date("2026-02-26T12:00:00Z");
    const now = new Date("2026-02-25T11:59:00Z"); // 1 min before window

    expect(isWithinChargeWindow(nextSession, 24, now)).toBe(false);
  });

  it("respects custom window hours", () => {
    const nextSession = new Date("2026-02-26T12:00:00Z");
    const now = new Date("2026-02-26T08:00:00Z"); // 4h before

    expect(isWithinChargeWindow(nextSession, 6, now)).toBe(true);
    expect(isWithinChargeWindow(nextSession, 2, now)).toBe(false);
  });
});

describe("getRefundEligibility", () => {
  const product = {
    day_of_week: 4, // Friday
    start_time: "15:00",
    timezone: "UTC",
    token_cost: 3,
  };

  it("returns eligible with full refund when charged for upcoming session and outside window", () => {
    // Wednesday 12:00, last charge is for upcoming Friday 2026-02-27 → >24h away
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getRefundEligibility(product, 24, now, "2026-02-27");

    expect(result.eligible).toBe(true);
    expect(result.refundAmount).toBe(3);
    expect(result.reason).toBeUndefined();
    expect(result.nextSession.toISOString()).toBe("2026-02-27T15:00:00.000Z");
  });

  it("returns not eligible with within_window reason when inside window", () => {
    // Friday 14:00, last charge is for today's session (2026-02-27) → 1h away (within 24h)
    const now = new Date("2026-02-27T14:00:00Z");
    const result = getRefundEligibility(product, 24, now, "2026-02-27");

    expect(result.eligible).toBe(false);
    expect(result.refundAmount).toBe(0);
    expect(result.reason).toBe("within_window");
  });

  it("returns not eligible at exact window boundary", () => {
    // Thursday 15:00, last charge is for Friday 2026-02-27 → exactly 24h
    const now = new Date("2026-02-26T15:00:00Z");
    const result = getRefundEligibility(product, 24, now, "2026-02-27");

    expect(result.eligible).toBe(false);
    expect(result.refundAmount).toBe(0);
    expect(result.reason).toBe("within_window");
  });

  it("denies refund after session already attended (not_yet_charged)", () => {
    // Product: Friday 15:00 UTC, costs 3 Sorgs
    //
    // Timeline:
    //   1. Customer enrolled before Friday → charged 3 for Friday's session
    //   2. Friday 15:00: session happens, gamer attends
    //   3. Saturday 10:00: customer unenrolls (next Friday is 6 days away)
    //
    // The charge they paid was for Friday's session, which already happened.
    // Refunding it means they attended for free.
    const saturday = new Date("2026-02-28T10:00:00Z"); // day after Friday session
    const result = getRefundEligibility(product, 24, saturday, "2026-02-27");

    // Last charge session (Fri 15:00 UTC) already started → not_yet_charged
    expect(result.eligible).toBe(false);
    expect(result.refundAmount).toBe(0);
    expect(result.reason).toBe("session_past");
  });

  it("grants refund when last charge is for upcoming session and outside window", () => {
    // Wednesday 12:00 UTC, charged for upcoming Friday (2026-02-27)
    // Session is Friday 15:00 UTC → more than 24h away → eligible
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getRefundEligibility(product, 24, now, "2026-02-27");

    expect(result.eligible).toBe(true);
    expect(result.refundAmount).toBe(3);
    expect(result.reason).toBeUndefined();
  });

  it("denies refund when last charge is for upcoming session but within window", () => {
    // Friday 14:00 UTC, charged for today's session (2026-02-27)
    // Session is Friday 15:00 UTC → 1h away → within 24h window
    const now = new Date("2026-02-27T14:00:00Z");
    const result = getRefundEligibility(product, 24, now, "2026-02-27");

    expect(result.eligible).toBe(false);
    expect(result.refundAmount).toBe(0);
    expect(result.reason).toBe("within_window");
  });

  it("denies refund same day after session started", () => {
    // Friday 16:00 UTC (session was at 15:00), last charge for today (2026-02-27)
    // Session already started at 15:00 → not_yet_charged
    const now = new Date("2026-02-27T16:00:00Z");
    const result = getRefundEligibility(product, 24, now, "2026-02-27");

    expect(result.eligible).toBe(false);
    expect(result.refundAmount).toBe(0);
    expect(result.reason).toBe("session_past");
  });

  it("handles Postgres TIME format (HH:MM:SS) for start_time", () => {
    // Same as "grants refund" case but with "15:00:00" instead of "15:00"
    const productWithSeconds = { ...product, start_time: "15:00:00" };
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getRefundEligibility(productWithSeconds, 24, now, "2026-02-27");

    expect(result.eligible).toBe(true);
    expect(result.refundAmount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// formatCountdown
// ---------------------------------------------------------------------------

describe("formatCountdown", () => {
  const mins = (n: number) => n * 60_000;
  const hours = (n: number) => n * 60 * 60_000;
  const days = (n: number) => n * 24 * 60 * 60_000;

  it("shows days when 1+ days away", () => {
    expect(formatCountdown(days(1))).toBe("1 day");
    expect(formatCountdown(days(3))).toBe("3 days");
    expect(formatCountdown(days(3) + hours(17))).toBe("3 days");
  });

  it("shows hours when 2–23 hours away", () => {
    expect(formatCountdown(hours(2) + mins(1))).toBe("2 hours");
    expect(formatCountdown(hours(5))).toBe("5 hours");
    expect(formatCountdown(hours(23) + mins(59))).toBe("23 hours");
  });

  it("shows hours and minutes when 1–2 hours away", () => {
    expect(formatCountdown(hours(1))).toBe("1 hour");
    expect(formatCountdown(hours(1) + mins(30))).toBe("1 hour and 30 minutes");
    expect(formatCountdown(hours(1) + mins(1))).toBe("1 hour and 1 minute");
    expect(formatCountdown(mins(119))).toBe("1 hour and 59 minutes");
  });

  it("shows minutes when under 1 hour", () => {
    expect(formatCountdown(mins(45))).toBe("45 minutes");
    expect(formatCountdown(mins(1))).toBe("1 minute");
    expect(formatCountdown(mins(0))).toBe("0 minutes");
  });

  it("clamps negative values to 0 minutes", () => {
    expect(formatCountdown(-1000)).toBe("0 minutes");
  });
});
