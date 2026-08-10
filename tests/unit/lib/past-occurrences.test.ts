import { describe, it, expect } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import {
  MAX_FUTURE_OCCURRENCES_PER_SLOT,
  MAX_PAST_OCCURRENCES_PER_SLOT,
  enumeratePastRowOccurrences,
  enumerateRowOccurrences,
} from "@/lib/session-occurrence";

/**
 * Backward occurrence enumeration — the half of the shared expansion helpers
 * the session feed needed and the dashboards never did.
 *
 * The forward walk has long-standing TZ regression tests — the enrollment
 * timezone suites, and the spring-forward case in `session-schedule.test.ts` —
 * because a naive week step lands an hour out on a DST transition and quietly
 * drops or duplicates an occurrence. The backward walk
 * takes exactly the same risk in the other direction, so it gets the same
 * treatment here: Helsinki, across the March transition, asserting the *dates*
 * rather than the instants, because a session's identity is its local date.
 */

const HELSINKI = "Europe/Helsinki";

/** The occurrence dates as they fall in `timezone`, oldest first. */
function datesIn(
  occurrences: Array<{ start: Date }>,
  timezone: string,
): string[] {
  return occurrences.map((o) => formatInTimeZone(o.start, timezone, "yyyy-MM-dd"));
}

describe("enumeratePastRowOccurrences", () => {
  it("walks back week by week from now, oldest first", () => {
    // Wednesday 2026-04-15, 18:00 UTC. Slot: Wednesday (weekday 2) at 16:00.
    const now = new Date("2026-04-15T18:00:00Z");

    const occurrences = enumeratePastRowOccurrences({
      slots: [{ weekday: 2, startTime: "16:00", durationMinutes: 90 }],
      timezone: "UTC",
      now,
      floor: new Date("2026-03-25T00:00:00Z"),
      endBoundary: null,
      maxOccurrences: MAX_PAST_OCCURRENCES_PER_SLOT,
    });

    expect(datesIn(occurrences, "UTC")).toEqual([
      "2026-03-25",
      "2026-04-01",
      "2026-04-08",
      // Today's 16:00 has already started and finished-or-not is not this
      // helper's question: it is in the past, so it is in the history.
      "2026-04-15",
    ]);
  });

  it("does not emit an occurrence that is still ahead of now", () => {
    // Same Wednesday, but read at 09:00 — before the 16:00 slot opens.
    const now = new Date("2026-04-15T09:00:00Z");

    const occurrences = enumeratePastRowOccurrences({
      slots: [{ weekday: 2, startTime: "16:00", durationMinutes: 90 }],
      timezone: "UTC",
      now,
      floor: new Date("2026-04-01T00:00:00Z"),
      endBoundary: null,
      maxOccurrences: MAX_PAST_OCCURRENCES_PER_SLOT,
    });

    expect(datesIn(occurrences, "UTC")).toEqual(["2026-04-01", "2026-04-08"]);
  });

  it("stops at the floor rather than walking forever", () => {
    const occurrences = enumeratePastRowOccurrences({
      slots: [{ weekday: 0, startTime: "10:00", durationMinutes: 60 }],
      timezone: "UTC",
      now: new Date("2026-04-15T18:00:00Z"),
      floor: new Date("2026-04-06T00:00:00Z"),
      endBoundary: null,
      maxOccurrences: MAX_PAST_OCCURRENCES_PER_SLOT,
    });

    expect(datesIn(occurrences, "UTC")).toEqual(["2026-04-06", "2026-04-13"]);
  });

  it("honours maxOccurrences so a bad floor cannot become an infinite walk", () => {
    const occurrences = enumeratePastRowOccurrences({
      slots: [{ weekday: 2, startTime: "16:00", durationMinutes: 90 }],
      timezone: "UTC",
      now: new Date("2026-04-15T18:00:00Z"),
      // A floor decades back — the sort of value a product with no start date
      // would produce if nobody bounded it.
      floor: new Date("1990-01-01T00:00:00Z"),
      endBoundary: null,
      maxOccurrences: 3,
    });

    expect(occurrences).toHaveLength(3);
    expect(datesIn(occurrences, "UTC")).toEqual([
      "2026-04-01",
      "2026-04-08",
      "2026-04-15",
    ]);
  });

  it("excludes occurrences after the product's end date", () => {
    const occurrences = enumeratePastRowOccurrences({
      slots: [{ weekday: 2, startTime: "16:00", durationMinutes: 90 }],
      timezone: "UTC",
      now: new Date("2026-04-15T18:00:00Z"),
      floor: new Date("2026-03-25T00:00:00Z"),
      endBoundary: new Date("2026-04-08T23:59:59Z"),
      maxOccurrences: MAX_PAST_OCCURRENCES_PER_SLOT,
    });

    expect(datesIn(occurrences, "UTC")).toEqual([
      "2026-03-25",
      "2026-04-01",
      "2026-04-08",
    ]);
  });

  it("merges several slots into one ascending history", () => {
    const occurrences = enumeratePastRowOccurrences({
      slots: [
        { weekday: 0, startTime: "10:00", durationMinutes: 60 },
        { weekday: 3, startTime: "10:00", durationMinutes: 60 },
      ],
      timezone: "UTC",
      now: new Date("2026-04-15T18:00:00Z"),
      floor: new Date("2026-04-06T00:00:00Z"),
      endBoundary: null,
      maxOccurrences: MAX_PAST_OCCURRENCES_PER_SLOT,
    });

    expect(datesIn(occurrences, "UTC")).toEqual([
      "2026-04-06",
      "2026-04-09",
      "2026-04-13",
    ]);
  });

  it("steps back a calendar week across a DST transition, not 168 hours", () => {
    // Helsinki moves EET → EEST on the last Sunday of March (2026-03-29). A
    // flat `now - 7 × 24h` crosses that boundary an hour off, which is enough
    // to make the week step land on the wrong side of the slot start and
    // either skip a session or repeat one. Asserting the DATES is the honest
    // check, because the local date is what a session is keyed by.
    const now = new Date("2026-04-08T15:00:00Z"); // Wednesday, 18:00 Helsinki

    const occurrences = enumeratePastRowOccurrences({
      slots: [{ weekday: 2, startTime: "16:30", durationMinutes: 90 }],
      timezone: HELSINKI,
      now,
      floor: new Date("2026-03-01T00:00:00Z"),
      endBoundary: null,
      maxOccurrences: MAX_PAST_OCCURRENCES_PER_SLOT,
    });

    expect(datesIn(occurrences, HELSINKI)).toEqual([
      "2026-03-04",
      "2026-03-11",
      "2026-03-18",
      "2026-03-25",
      // The first Wednesday after the transition. It is present exactly once.
      "2026-04-01",
      "2026-04-08",
    ]);
  });

  it("keeps each occurrence's own local clock face across the transition", () => {
    const occurrences = enumeratePastRowOccurrences({
      slots: [{ weekday: 2, startTime: "16:30", durationMinutes: 90 }],
      timezone: HELSINKI,
      now: new Date("2026-04-08T15:00:00Z"),
      floor: new Date("2026-03-20T00:00:00Z"),
      endBoundary: null,
      maxOccurrences: MAX_PAST_OCCURRENCES_PER_SLOT,
    });

    // Every occurrence starts at 16:30 wall-clock in Helsinki, on both sides of
    // the offset change — which is the whole point of storing a slot as a
    // weekday plus a clock face rather than as an instant.
    for (const occurrence of occurrences) {
      expect(formatInTimeZone(occurrence.start, HELSINKI, "HH:mm")).toBe("16:30");
      expect(formatInTimeZone(occurrence.end, HELSINKI, "HH:mm")).toBe("18:00");
    }
  });
});

/**
 * The forward walker's own guard rail, tested beside its backward sibling's
 * because they exist for the same reason.
 *
 * `cap: Infinity` means "let the end boundary decide", and every caller today
 * does supply one — a product's end date, or a cancelled subscription's
 * paid-through instant. But that invariant lived in the call sites rather than
 * next to the `while` it protected, so a future caller pairing `Infinity` with
 * a null boundary would have hung the render rather than failed a test. This is
 * that test.
 */
describe("enumerateRowOccurrences — the uncapped walk is still bounded", () => {
  it("terminates on the per-slot ceiling when nothing else stops it", () => {
    const occurrences = enumerateRowOccurrences({
      slots: [{ weekday: 2, startTime: "16:00", durationMinutes: 90 }],
      timezone: HELSINKI,
      now: new Date("2026-04-15T18:00:00Z"),
      startBoundary: null,
      // The combination that used to run forever: no bound on either side.
      endBoundary: null,
      cap: Number.POSITIVE_INFINITY,
      windowCloseMs: 0,
    });

    expect(occurrences).toHaveLength(MAX_FUTURE_OCCURRENCES_PER_SLOT);
  });

  it("leaves an ordinary bounded walk exactly where it was", () => {
    // Three Wednesdays, ended by the boundary rather than by the ceiling —
    // proving the guard rail sits far enough out to be invisible in real use.
    const occurrences = enumerateRowOccurrences({
      slots: [{ weekday: 2, startTime: "16:00", durationMinutes: 90 }],
      timezone: HELSINKI,
      now: new Date("2026-04-15T18:00:00Z"),
      startBoundary: null,
      endBoundary: new Date("2026-05-07T00:00:00Z"),
      cap: Number.POSITIVE_INFINITY,
      windowCloseMs: 0,
    });

    expect(datesIn(occurrences, HELSINKI)).toEqual([
      "2026-04-22",
      "2026-04-29",
      "2026-05-06",
    ]);
  });
});
