import { describe, it, expect } from "vitest";
import { computeSessionWindow } from "@/lib/voice-schedule";

// Helper: create a Date at a specific wall-clock time in UTC
function utcDate(isoString: string): Date {
  return new Date(isoString);
}

// Tuesday = dayOfWeek 1 in our system (Mon=0, Tue=1, ... Sun=6)
const tuesdaySchedule = {
  day_of_week: 1,
  start_time: "14:00",
  timezone: "UTC",
  duration_minutes: 60,
};

describe("computeSessionWindow", () => {
  it("should return isOpen=true during a session", () => {
    // Tuesday 14:30 UTC — mid-session
    const now = utcDate("2026-03-03T14:30:00Z"); // March 3 2026 is a Tuesday
    const result = computeSessionWindow(tuesdaySchedule, now);

    expect(result.isOpen).toBe(true);
  });

  it("should return isOpen=true in the pre-session window", () => {
    // Tuesday 13:57 UTC — 3 minutes before session, within 5-min window
    const now = utcDate("2026-03-03T13:57:00Z");
    const result = computeSessionWindow(tuesdaySchedule, now);

    expect(result.isOpen).toBe(true);
  });

  it("should return isOpen=true in the post-session window", () => {
    // Tuesday 15:03 UTC — 3 minutes after session end, within 5-min buffer
    const now = utcDate("2026-03-03T15:03:00Z");
    const result = computeSessionWindow(tuesdaySchedule, now);

    expect(result.isOpen).toBe(true);
  });

  it("should return isOpen=false before the pre-session window", () => {
    // Tuesday 13:50 UTC — 10 minutes before session, outside 5-min window
    const now = utcDate("2026-03-03T13:50:00Z");
    const result = computeSessionWindow(tuesdaySchedule, now);

    expect(result.isOpen).toBe(false);
  });

  it("should return isOpen=false after the post-session window", () => {
    // Tuesday 15:10 UTC — 10 minutes after session end, outside 5-min buffer
    const now = utcDate("2026-03-03T15:10:00Z");
    const result = computeSessionWindow(tuesdaySchedule, now);

    expect(result.isOpen).toBe(false);
  });

  it("should return isOpen=false on a different day", () => {
    // Wednesday 14:30 UTC — right time, wrong day
    const now = utcDate("2026-03-04T14:30:00Z");
    const result = computeSessionWindow(tuesdaySchedule, now);

    expect(result.isOpen).toBe(false);
  });

  it("should have nextSessionStart pointing to the correct date", () => {
    // Monday 10:00 UTC — day before the session
    const now = utcDate("2026-03-02T10:00:00Z");
    const result = computeSessionWindow(tuesdaySchedule, now);

    expect(result.isOpen).toBe(false);
    // Next session should be Tuesday March 3 at 14:00 UTC
    expect(result.nextSessionStart.toISOString()).toBe("2026-03-03T14:00:00.000Z");
  });

  it("should handle timezone offsets", () => {
    // Schedule in Europe/Helsinki (UTC+2 in winter, UTC+3 in summer)
    // March 3 2026 is still winter time (UTC+2), so 14:00 Helsinki = 12:00 UTC
    const helsinkiSchedule = {
      day_of_week: 1, // Tuesday
      start_time: "14:00",
      timezone: "Europe/Helsinki",
      duration_minutes: 60,
    };

    // 12:30 UTC = 14:30 Helsinki — mid-session
    const now = utcDate("2026-03-03T12:30:00Z");
    const result = computeSessionWindow(helsinkiSchedule, now);

    expect(result.isOpen).toBe(true);
  });

  it("should set windowClosesAt to session end + buffer", () => {
    const now = utcDate("2026-03-02T10:00:00Z");
    const result = computeSessionWindow(tuesdaySchedule, now);

    // Session: Tue 14:00-15:00 UTC, window closes at 15:05 UTC
    expect(result.windowClosesAt.toISOString()).toBe("2026-03-03T15:05:00.000Z");
  });

  it("should set windowOpensAt to session start - buffer", () => {
    const now = utcDate("2026-03-02T10:00:00Z");
    const result = computeSessionWindow(tuesdaySchedule, now);

    // Session: Tue 14:00 UTC, window opens at 13:55 UTC
    expect(result.windowOpensAt.toISOString()).toBe("2026-03-03T13:55:00.000Z");
  });

  it("should detect active session correctly across a DST spring-forward", () => {
    // Europe/Helsinki springs forward between March 28 and March 29, 2026.
    // March 24 (Tue, UTC+2): 14:00 Helsinki = 12:00 UTC
    // March 31 (Tue, UTC+3): 14:00 Helsinki = 11:00 UTC
    //
    // At 12:30 UTC on March 24, the session is live (14:30 Helsinki).
    // getNextSessionStart returns March 31 11:00 UTC (next week, UTC+3).
    // Subtracting 7 days in UTC gives March 24 11:00 UTC — wrong by 1 hour.
    // The correct prevStart is March 24 12:00 UTC (14:00 Helsinki, UTC+2).
    const helsinkiSchedule = {
      day_of_week: 1, // Tuesday
      start_time: "14:00",
      timezone: "Europe/Helsinki",
      duration_minutes: 60,
    };

    const now = utcDate("2026-03-24T12:30:00Z"); // 14:30 Helsinki, mid-session
    const result = computeSessionWindow(helsinkiSchedule, now);

    expect(result.isOpen).toBe(true);
    // The session started at 12:00 UTC (14:00 Helsinki UTC+2)
    expect(result.nextSessionStart.toISOString()).toBe("2026-03-24T12:00:00.000Z");
  });

  it("should detect active session that crosses midnight", () => {
    // Tuesday 23:30 UTC, 90-minute session → ends Wednesday 01:00 UTC
    const lateSchedule = {
      day_of_week: 1, // Tuesday
      start_time: "23:30",
      timezone: "UTC",
      duration_minutes: 90,
    };

    // Wednesday 00:15 UTC — 45 minutes into the session
    const now = utcDate("2026-03-04T00:15:00Z");
    const result = computeSessionWindow(lateSchedule, now);

    expect(result.isOpen).toBe(true);
    expect(result.nextSessionStart.toISOString()).toBe("2026-03-03T23:30:00.000Z");
  });
});
