import { describe, it, expect } from "vitest";
import {
  addMinutes,
  clockTime,
  formatTimeOfDay,
  hourOf,
  minutesBetween,
  minuteOf,
  parseTimeOfDay,
  withHour,
  withMinute,
} from "@/lib/time-of-day";

// Wall-clock time-of-day arithmetic (minutes since midnight). No dates, no
// timezones — these tests pin the pure clock behaviour, including the
// past-midnight wrap and the Postgres "HH:MM:SS" tolerance.

describe("parseTimeOfDay", () => {
  it("parses HH:MM into minutes since midnight", () => {
    expect(parseTimeOfDay("00:00")).toBe(0);
    expect(parseTimeOfDay("16:30")).toBe(16 * 60 + 30);
    expect(parseTimeOfDay("23:45")).toBe(23 * 60 + 45);
  });

  it("tolerates Postgres HH:MM:SS by ignoring the seconds", () => {
    expect(parseTimeOfDay("16:30:00")).toBe(16 * 60 + 30);
  });
});

describe("formatTimeOfDay", () => {
  it("formats minutes as zero-padded HH:MM", () => {
    expect(formatTimeOfDay(0)).toBe("00:00");
    expect(formatTimeOfDay(9 * 60 + 5)).toBe("09:05");
  });

  it("wraps past midnight on a 24h clock", () => {
    expect(formatTimeOfDay(24 * 60 + 30)).toBe("00:30"); // 24:30 → 00:30
    expect(formatTimeOfDay(-30)).toBe("23:30"); // negative wraps too
  });
});

describe("clockTime", () => {
  it("strips seconds for display", () => {
    expect(clockTime("16:00:00")).toBe("16:00");
    expect(clockTime("16:00")).toBe("16:00");
  });
});

describe("addMinutes", () => {
  it("adds a duration to a start time", () => {
    expect(addMinutes("16:00", 90)).toBe("17:30");
  });

  it("wraps a session that crosses midnight", () => {
    expect(addMinutes("23:00", 90)).toBe("00:30");
  });
});

describe("minutesBetween", () => {
  it("returns end − start in minutes", () => {
    expect(minutesBetween("16:00", "17:30")).toBe(90);
  });

  it("goes negative when end precedes start (caller's job to guard)", () => {
    expect(minutesBetween("16:00", "15:00")).toBe(-60);
  });
});

describe("hourOf / minuteOf", () => {
  it("returns zero-padded components matching <option> values", () => {
    expect(hourOf("09:05")).toBe("09");
    expect(minuteOf("09:05")).toBe("05");
    expect(hourOf("16:00:00")).toBe("16");
  });
});

describe("withHour / withMinute", () => {
  it("replaces one component, keeping the other", () => {
    expect(withHour("16:30", 9)).toBe("09:30");
    expect(withMinute("16:30", 0)).toBe("16:00");
  });
});
