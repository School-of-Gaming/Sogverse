import { describe, expect, it } from "vitest";
import {
  sortFamilyEnrollments,
  type FamilyEnrollmentSummary,
} from "@/components/family/enrollment-rollup";

/**
 * The order of a child's cards is the order their week actually runs, and it is
 * the one thing about the family dashboards a reader cannot recover for
 * themselves: the cards carry a schedule sentence, not a rank. So what is
 * pinned here is the banding — what is happening before what is waiting before
 * what is over — and the soonest-session ordering inside the running band, which
 * is the rule the top of the page is built on.
 *
 * Every case is expressed as ids in, ids out, so a fixture says only what the
 * sort is allowed to read: the next session, the end date, and the name that
 * breaks a tie.
 */

const TZ = "Europe/Helsinki";

/** Mid-afternoon on a Wednesday, well clear of any local midnight. */
const NOW = new Date("2026-02-11T13:00:00Z");

/** Minutes from `NOW`, as an instant. */
function fromNow(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

/**
 * One enrollment, named by its id, carrying only what the sort reads. Sessions
 * are given as minutes from `NOW` so a case reads as "an hour out" rather than
 * as a timestamp somebody has to date-check.
 */
function enrollment(
  id: string,
  fields: {
    startsInMinutes?: number;
    endDate?: string;
    productName?: string;
  } = {},
): FamilyEnrollmentSummary {
  const start =
    fields.startsInMinutes === undefined
      ? null
      : fromNow(fields.startsInMinutes);
  return {
    participationId: id,
    productName: fields.productName ?? id,
    productType: "consumer_club",
    nextSessionStart: start,
    nextSessionEnd: start === null ? null : new Date(start.getTime() + 5_400_000),
    hasVoiceRoom: true,
    voiceHref: "#",
    siteName: null,
    openHref: "#",
    endDate: fields.endDate ?? null,
    timezone: TZ,
    waitlistPosition: null,
    paymentProblem: false,
    cancellation: null,
    scheduleLines: [],
  };
}

function sortedIds(enrollments: readonly FamilyEnrollmentSummary[]): string[] {
  return sortFamilyEnrollments(enrollments, NOW).map((e) => e.participationId);
}

/** One card of each band, deliberately built in the wrong order. */
const RUNNING = enrollment("running", { startsInMinutes: 60 });
const WAITING = enrollment("waiting");
const FINISHED = enrollment("finished", { endDate: "2026-01-31" });

describe("sortFamilyEnrollments — bands", () => {
  const cases: { name: string; input: FamilyEnrollmentSummary[] }[] = [
    { name: "already in order", input: [RUNNING, WAITING, FINISHED] },
    { name: "exactly reversed", input: [FINISHED, WAITING, RUNNING] },
    { name: "finished first", input: [FINISHED, RUNNING, WAITING] },
    { name: "waiting first", input: [WAITING, FINISHED, RUNNING] },
  ];

  it.each(cases)(
    "puts running before waiting before finished ($name)",
    ({ input }) => {
      expect(sortedIds(input)).toEqual(["running", "waiting", "finished"]);
    },
  );

  // A run with an end date still ahead of it is not finished, whatever its
  // schedule looks like — the band is a fact about the date, not about whether
  // anything is left on the calendar.
  it("keeps a dated run that has not ended yet out of the finished band", () => {
    const dated = enrollment("dated", {
      startsInMinutes: 120,
      endDate: "2026-06-30",
    });
    expect(sortedIds([WAITING, dated])).toEqual(["dated", "waiting"]);
  });

  // The endedness test needs both halves: a product whose last day has passed
  // but which still has a session on the books is somebody's data problem, and
  // the card that says "this is happening" has to win over the one that says
  // "this is over".
  it("treats a past end date with a session still ahead as running", () => {
    const contradictory = enrollment("contradictory", {
      startsInMinutes: 30,
      endDate: "2026-01-31",
    });
    expect(sortedIds([FINISHED, contradictory])).toEqual([
      "contradictory",
      "finished",
    ]);
  });
});

describe("sortFamilyEnrollments — inside a band", () => {
  // The whole point of the running band: tonight's club is above next Monday's,
  // however they arrived.
  it("orders the running band by soonest session", () => {
    const input = [
      enrollment("next-week", { startsInMinutes: 60 * 24 * 7 }),
      enrollment("tonight", { startsInMinutes: 180 }),
      enrollment("tomorrow", { startsInMinutes: 60 * 24 }),
      enrollment("in-an-hour", { startsInMinutes: 60 }),
    ];
    expect(sortedIds(input)).toEqual([
      "in-an-hour",
      "tonight",
      "tomorrow",
      "next-week",
    ]);
  });

  // Two clubs on the same evening have no ordering of their own, so the name is
  // the tiebreak — stable, and the same on every render.
  it("falls back to the product name when two sessions start together", () => {
    const input = [
      enrollment("beta", { startsInMinutes: 90, productName: "Roblox Club" }),
      enrollment("alpha", { startsInMinutes: 90, productName: "Minecraft Club" }),
    ];
    expect(sortedIds(input)).toEqual(["alpha", "beta"]);
  });

  // Inside the finished band the most recent run leads: a camp that ended last
  // week is what a parent is looking for, not one from two years ago.
  it("orders the finished band most-recently-ended first", () => {
    const input = [
      enrollment("last-year", { endDate: "2025-06-30" }),
      enrollment("last-week", { endDate: "2026-02-06" }),
      enrollment("last-month", { endDate: "2026-01-10" }),
    ];
    expect(sortedIds(input)).toEqual(["last-week", "last-month", "last-year"]);
  });
});
