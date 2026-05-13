import { describe, it, expect } from "vitest";
import { getNextSessionStart, formatCountdown } from "@/lib/enrollment";

// All tests use explicit `now` to be deterministic.
// Timezone "UTC" simplifies reasoning — wall-clock === UTC.

describe("getNextSessionStart", () => {
  it("returns next occurrence when today is before the target day", () => {
    // Wednesday 2026-02-25 12:00 UTC. Target: Friday (dayOfWeek=4)
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 4, startTime: "15:00", timezone: "UTC" },
      { now },
    );

    // Next Friday is 2026-02-27 at 15:00 UTC
    expect(result.toISOString()).toBe("2026-02-27T15:00:00.000Z");
  });

  it("returns today if session is later today", () => {
    // Wednesday 2026-02-25 10:00 UTC. Target: Wednesday (dayOfWeek=2), 15:00
    const now = new Date("2026-02-25T10:00:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 2, startTime: "15:00", timezone: "UTC" },
      { now },
    );

    expect(result.toISOString()).toBe("2026-02-25T15:00:00.000Z");
  });

  it("skips to next week if session already passed today", () => {
    // Wednesday 2026-02-25 16:00 UTC. Target: Wednesday 15:00
    const now = new Date("2026-02-25T16:00:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 2, startTime: "15:00", timezone: "UTC" },
      { now },
    );

    // Next Wednesday is 2026-03-04
    expect(result.toISOString()).toBe("2026-03-04T15:00:00.000Z");
  });

  it("handles Sunday (dayOfWeek=6)", () => {
    // Wednesday 2026-02-25 12:00 UTC. Target: Sunday (dayOfWeek=6)
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 6, startTime: "10:00", timezone: "UTC" },
      { now },
    );

    // Next Sunday is 2026-03-01
    expect(result.toISOString()).toBe("2026-03-01T10:00:00.000Z");
  });

  it("handles Monday (dayOfWeek=0)", () => {
    // Wednesday 2026-02-25 12:00 UTC. Target: Monday (dayOfWeek=0)
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 0, startTime: "09:00", timezone: "UTC" },
      { now },
    );

    // Next Monday is 2026-03-02
    expect(result.toISOString()).toBe("2026-03-02T09:00:00.000Z");
  });

  it("converts wall-clock time from a different timezone to UTC", () => {
    // Wednesday 2026-02-25 12:00 UTC. Session: Friday 15:00 Europe/Helsinki (UTC+2)
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 4, startTime: "15:00", timezone: "Europe/Helsinki" },
      { now },
    );

    // Friday 15:00 Helsinki = Friday 13:00 UTC → 2026-02-27T13:00:00Z
    expect(result.toISOString()).toBe("2026-02-27T13:00:00.000Z");
  });

  it("handles US timezone offset correctly", () => {
    // Wednesday 2026-02-25 12:00 UTC. Session: Thursday 10:00 America/New_York (UTC-5 in Feb)
    const now = new Date("2026-02-25T12:00:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 3, startTime: "10:00", timezone: "America/New_York" },
      { now },
    );

    // Thursday 10:00 EST = Thursday 15:00 UTC → 2026-02-26T15:00:00Z
    expect(result.toISOString()).toBe("2026-02-26T15:00:00.000Z");
  });

  it("handles day boundary: session local day differs from UTC day (positive offset)", () => {
    // "now" is Wed 2026-02-25 20:00 UTC = Thu 2026-02-26 05:00 JST.
    // Session: Wednesday 01:00 Asia/Tokyo (UTC+9) → Wednesday 01:00 JST = Tuesday 16:00 UTC.
    // In JST it's already Thursday, so next Wednesday = March 4 JST.
    // March 4 01:00 JST = March 3 16:00 UTC.
    const now = new Date("2026-02-25T20:00:00Z");
    const result = getNextSessionStart(
      { dayOfWeek: 2, startTime: "01:00", timezone: "Asia/Tokyo" },
      { now },
    );

    expect(result.toISOString()).toBe("2026-03-03T16:00:00.000Z");
  });

  it("handles day boundary: session local day differs from UTC day (negative offset)", () => {
    // Wednesday 2026-02-25 02:00 UTC. Session: Tuesday 22:00 America/Chicago (UTC-6 in Feb).
    // Tuesday 22:00 CST = Wednesday 04:00 UTC.
    // "now" is Wed 02:00 UTC = Tue 20:00 CST. Session is later today (Tue CST, 22:00 > 20:00).
    const now = new Date("2026-02-25T02:00:00Z"); // Tue 20:00 CST
    const result = getNextSessionStart(
      { dayOfWeek: 1, startTime: "22:00", timezone: "America/Chicago" },
      { now },
    );

    // Tue 22:00 CST = Wed 04:00 UTC → 2026-02-25T04:00:00Z (still "today" in CST)
    expect(result.toISOString()).toBe("2026-02-25T04:00:00.000Z");
  });

  it("handles DST transition: spring forward (US)", () => {
    // 2026 US DST spring forward: March 8, 2:00 AM → 3:00 AM.
    // Session: Sunday 10:00 America/New_York (dayOfWeek=6).
    // On March 8 (DST day), 10:00 EDT = 14:00 UTC (offset is -4, not -5).
    const now = new Date("2026-03-07T12:00:00Z"); // Saturday before DST
    const result = getNextSessionStart(
      { dayOfWeek: 6, startTime: "10:00", timezone: "America/New_York" },
      { now },
    );

    // Sunday March 8, 10:00 EDT (post-spring-forward) = 14:00 UTC
    expect(result.toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });

  it("handles DST transition: fall back (EU)", () => {
    // 2026 EU DST fall back: October 25, 3:00 AM → 2:00 AM (Europe/Helsinki, UTC+3 → UTC+2).
    // Session: Sunday 15:00 Europe/Helsinki (dayOfWeek=6).
    // On Oct 25, 15:00 EET (post-fallback) = 13:00 UTC (offset is +2, not +3).
    const now = new Date("2026-10-24T12:00:00Z"); // Saturday before fallback
    const result = getNextSessionStart(
      { dayOfWeek: 6, startTime: "15:00", timezone: "Europe/Helsinki" },
      { now },
    );

    // Sunday Oct 25, 15:00 EET = 13:00 UTC
    expect(result.toISOString()).toBe("2026-10-25T13:00:00.000Z");
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
    expect(formatCountdown(days(1), "en")).toBe("1 day");
    expect(formatCountdown(days(3), "en")).toBe("3 days");
    expect(formatCountdown(days(3) + hours(17), "en")).toBe("3 days");
  });

  it("shows hours when 2–23 hours away", () => {
    expect(formatCountdown(hours(2) + mins(1), "en")).toBe("2 hours");
    expect(formatCountdown(hours(5), "en")).toBe("5 hours");
    expect(formatCountdown(hours(23) + mins(59), "en")).toBe("23 hours");
  });

  it("shows hours and minutes when 1–2 hours away", () => {
    expect(formatCountdown(hours(1), "en")).toBe("1 hour");
    expect(formatCountdown(hours(1) + mins(30), "en")).toBe("1 hour, 30 minutes");
    expect(formatCountdown(hours(1) + mins(1), "en")).toBe("1 hour, 1 minute");
    expect(formatCountdown(mins(119), "en")).toBe("1 hour, 59 minutes");
  });

  it("shows minutes when under 1 hour", () => {
    expect(formatCountdown(mins(45), "en")).toBe("45 minutes");
    expect(formatCountdown(mins(1), "en")).toBe("1 minute");
    expect(formatCountdown(mins(0), "en")).toBe("0 minutes");
  });

  it("clamps negative values to 0 minutes", () => {
    expect(formatCountdown(-1000, "en")).toBe("0 minutes");
  });

  it("localizes units for Finnish", () => {
    expect(formatCountdown(days(3), "fi")).toContain("3");
    expect(formatCountdown(mins(45), "fi")).toContain("45");
  });
});
