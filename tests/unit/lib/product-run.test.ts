import { describe, expect, it } from "vitest";
import { runEndedOn, runLiveness } from "@/lib/product-run";

/**
 * Where a product's run stands is asked of the clock rather than baked into a
 * summary, and it is asked identically by a gedu's dashboard card and a
 * family's. These pin the two answers at their boundaries — the instant a
 * session starts, and the instant a calendar day ends in the product's own
 * zone — because those are the only places either answer can be wrong.
 */

/**
 * Liveness is asked of the clock rather than baked into the summary, so that a
 * card's gradient, badge and Join button can never be answering two different
 * instants. These pin the three things that follow from that.
 */
describe("runLiveness", () => {
  const start = new Date("2026-02-11T14:30:00Z");
  const end = new Date("2026-02-11T16:00:00Z");
  const remote = { nextSessionStart: start, nextSessionEnd: end, hasVoiceRoom: true };

  it("is quiet before the session, on both counts", () => {
    // Well before the window opens, not merely before the start.
    const early = new Date("2026-02-11T09:00:00Z");
    expect(runLiveness(remote, early)).toEqual({
      inProgress: false,
      voiceIsOpen: false,
    });
  });

  it("reports in progress from the start instant onwards", () => {
    expect(runLiveness(remote, start).inProgress).toBe(true);
    expect(
      runLiveness(remote, new Date("2026-02-11T15:00:00Z")).inProgress,
    ).toBe(true);
  });

  it("never opens a window on a product with no room", () => {
    // Mid-session, which is exactly when a room would report itself open.
    const onsite = { ...remote, hasVoiceRoom: false };
    const midSession = new Date("2026-02-11T15:00:00Z");
    expect(runLiveness(onsite, midSession)).toEqual({
      inProgress: true,
      voiceIsOpen: false,
    });
  });

  it("says nothing is happening when nothing is scheduled", () => {
    expect(
      runLiveness(
        { nextSessionStart: null, nextSessionEnd: null, hasVoiceRoom: true },
        start,
      ),
    ).toEqual({ inProgress: false, voiceIsOpen: false });
  });
});

/**
 * Whether a run is over is the one thing standing between a card that reads as
 * history and a card that reads as a scheduling fault, and it turns on a
 * calendar date's day ending — which is a different instant in every zone. These
 * pin the boundary itself.
 */
describe("runEndedOn", () => {
  const helsinki = (endDate: string | null) => ({
    endDate,
    timezone: "Europe/Helsinki",
    nextSessionStart: null,
  });

  it("says nothing about a run with no last day", () => {
    expect(
      runEndedOn(helsinki(null), new Date("2026-02-11T09:00:00Z")),
    ).toBeNull();
  });

  it("keeps a run alive on its own last day, right to the end of it", () => {
    // 13 Jun 2025, 23:58 Helsinki — still the last day, so still running.
    expect(
      runEndedOn(
        helsinki("2025-06-13"),
        new Date("2025-06-13T20:58:00Z"),
      ),
    ).toBeNull();
  });

  it("ends it once that day is over, and names the day", () => {
    // 14 Jun 2025, 00:02 Helsinki — one minute past.
    expect(
      runEndedOn(
        helsinki("2025-06-13"),
        new Date("2025-06-13T21:02:00Z"),
      ),
    ).toBe("2025-06-13");
  });

  /**
   * The day ends where the schedule lives. A viewer somewhere else does not get
   * to retire a Helsinki club early or keep it alive late — otherwise the same
   * card would be history for one gedu and current for the gedu beside them.
   */
  it("ends the day in the product's zone, not the viewer's", () => {
    // 13 Jun 2025 22:30 UTC: already the 14th in Helsinki (UTC+3), still the
    // 13th in New York. The Helsinki product is over; the New York one is not.
    const instant = new Date("2025-06-13T22:30:00Z");
    expect(runEndedOn(helsinki("2025-06-13"), instant)).toBe("2025-06-13");
    expect(
      runEndedOn(
        {
          endDate: "2025-06-13",
          timezone: "America/New_York",
          nextSessionStart: null,
        },
        instant,
      ),
    ).toBeNull();
  });

  /**
   * The one case the date test alone gets wrong: a session that starts on the
   * final day and is still running after that day's midnight. The run is past
   * its end date and demonstrably not over, and a card calling it history would
   * be withholding the Join from a session somebody is sitting in.
   */
  it("is not over while one of its own sessions is still in flight", () => {
    expect(
      runEndedOn(
        {
          endDate: "2025-06-13",
          timezone: "Europe/Helsinki",
          nextSessionStart: new Date("2025-06-13T20:00:00Z"),
        },
        new Date("2025-06-13T21:10:00Z"),
      ),
    ).toBeNull();
  });
});
