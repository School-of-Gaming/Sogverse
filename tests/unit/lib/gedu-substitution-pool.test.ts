import { describe, expect, it } from "vitest";
import {
  SUBSTITUTION_URGENT_WITHIN_MS,
  buildSubstitutionPoolRows,
  isSubstitutionUrgent,
  sortSubstitutionPoolRows,
  type SubstitutionPoolRow,
} from "@/lib/gedu-substitution-pool";
import type { OpenSubstitutionRequest } from "@/services/session-substitution";

/**
 * **The Substitutions page is read for urgency, and the order is how it says
 * so.** The queue hands its rows over by date and then by product; what the
 * page wants is the instant each session starts, soonest first, with the
 * orphaned dates — the ones whose weekday the schedule no longer projects —
 * somewhere honest rather than at the front.
 *
 * Both halves of that are pure and clock-free on one side and clock-only on the
 * other, which is why they are two functions: the order is a property of the
 * rows, and whether a row is urgent is a property of the moment somebody looks.
 */

const TIME_ZONE = "Europe/Helsinki";

function row(
  requestId: string,
  sessionDate: string,
  startsAt: string | null,
): SubstitutionPoolRow {
  return {
    requestId,
    groupId: `group-${requestId}`,
    groupName: `Group ${requestId}`,
    sessionDate,
    startsAt: startsAt === null ? null : new Date(startsAt),
    endsAt: startsAt === null ? null : new Date(startsAt),
    timezone: TIME_ZONE,
    productName: `Product ${requestId}`,
    productType: "consumer_club",
    topic: "minecraft_java",
    spokenLanguageCode: "fi",
    isRemote: true,
    siteName: null,
    role: "primary",
    feeCents: 6500,
    hasOffered: false,
  };
}

const ids = (rows: readonly SubstitutionPoolRow[]) =>
  rows.map((r) => r.requestId);

describe("the substitution pool's order", () => {
  it("puts the soonest session first", () => {
    const sorted = sortSubstitutionPoolRows([
      row("late", "2026-03-20", "2026-03-20T15:00:00Z"),
      row("soon", "2026-03-17", "2026-03-17T15:00:00Z"),
      row("middle", "2026-03-18", "2026-03-18T15:00:00Z"),
    ]);
    expect(ids(sorted)).toEqual(["soon", "middle", "late"]);
  });

  it("orders two sessions on one date by their clock faces", () => {
    // The whole reason the order is by instant rather than by date: a morning
    // camp and an evening club on one Tuesday are a working day apart in the
    // reader's decision, and the queue's own date order had them adjacent in
    // whatever order the products happened to come back in.
    const sorted = sortSubstitutionPoolRows([
      row("evening", "2026-03-17", "2026-03-17T17:00:00Z"),
      row("morning", "2026-03-17", "2026-03-17T07:00:00Z"),
    ]);
    expect(ids(sorted)).toEqual(["morning", "evening"]);
  });

  it("puts an orphaned date at the end of its own day, not at either end", () => {
    // A date the schedule no longer projects has no instant to be ordered
    // against. It is still somewhere on that date, so it sorts below every
    // session that day whose time is known and above the next day's — which is
    // the one placement that is true whatever hour it turns out to have been.
    const sorted = sortSubstitutionPoolRows([
      row("next-day", "2026-03-18", "2026-03-18T06:00:00Z"),
      row("orphan", "2026-03-17", null),
      row("same-day-late", "2026-03-17", "2026-03-17T19:00:00Z"),
    ]);
    expect(ids(sorted)).toEqual(["same-day-late", "orphan", "next-day"]);
  });

  it("reads an orphan's day in the product's zone, not the runtime's", () => {
    // A Helsinki day ends at 21:59 UTC in winter. A session at 22:30 UTC on the
    // 17th is already the 18th there, so the orphan dated the 17th belongs
    // *before* it — which a UTC end-of-day would get backwards.
    const sorted = sortSubstitutionPoolRows([
      row("next-day-early", "2026-03-18", "2026-03-17T22:30:00Z"),
      row("orphan", "2026-03-17", null),
    ]);
    expect(ids(sorted)).toEqual(["orphan", "next-day-early"]);
  });

  it("breaks a tie by request id, so a refetch cannot reshuffle the grid", () => {
    const rows = [
      row("b", "2026-03-17", "2026-03-17T15:00:00Z"),
      row("a", "2026-03-17", "2026-03-17T15:00:00Z"),
      row("c", "2026-03-17", "2026-03-17T15:00:00Z"),
    ];
    expect(ids(sortSubstitutionPoolRows(rows))).toEqual(["a", "b", "c"]);
    // Same answer whatever order they arrive in — which is the property, not
    // the alphabet.
    expect(ids(sortSubstitutionPoolRows([...rows].reverse()))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("leaves the caller's array alone", () => {
    const rows = [
      row("late", "2026-03-20", "2026-03-20T15:00:00Z"),
      row("soon", "2026-03-17", "2026-03-17T15:00:00Z"),
    ];
    sortSubstitutionPoolRows(rows);
    expect(ids(rows)).toEqual(["late", "soon"]);
  });

  it("is what the shaper hands back, so the page never sorts again", () => {
    // The ordering has one home. A page re-sorting rows it was given would be a
    // second answer to a settled question, and this is what lets it not.
    const shaped = buildSubstitutionPoolRows(
      [wireRequest("later", "2026-03-24", 1), wireRequest("sooner", "2026-03-17", 1)],
      "en",
    );
    expect(ids(shaped)).toEqual(["sooner", "later"]);
  });
});

describe("which sessions the page marks urgent", () => {
  const now = new Date("2026-03-17T12:00:00Z");

  it("marks one starting inside the next day", () => {
    expect(
      isSubstitutionUrgent(
        { startsAt: new Date(now.getTime() + 3 * 60 * 60 * 1000) },
        now,
      ),
    ).toBe(true);
  });

  it("leaves one further out alone", () => {
    expect(
      isSubstitutionUrgent(
        { startsAt: new Date(now.getTime() + SUBSTITUTION_URGENT_WITHIN_MS + 1) },
        now,
      ),
    ).toBe(false);
  });

  it("marks one that has already started, which is more urgent and not less", () => {
    expect(
      isSubstitutionUrgent(
        { startsAt: new Date(now.getTime() - 60 * 60 * 1000) },
        now,
      ),
    ).toBe(true);
  });

  it("never marks an orphaned date, which has no session to be late for", () => {
    expect(isSubstitutionUrgent({ startsAt: null }, now)).toBe(false);
  });
});

/** One open request, enough of a product for the shaper to work on. */
function wireRequest(
  id: string,
  sessionDate: string,
  weekday: number,
): OpenSubstitutionRequest {
  return {
    request_id: id,
    group_id: `group-${id}`,
    group_name: `Group ${id}`,
    session_date: sessionDate,
    role: "primary",
    fee_cents: 6500,
    has_offered: false,
    product: {
      id: `product-${id}`,
      product_type: "consumer_club",
      topic: "minecraft_java",
      spoken_language_code: "fi",
      timezone: TIME_ZONE,
      is_remote: true,
      start_date: "2026-01-06",
      end_date: null,
      site_name: null,
      translations: [{ locale: "en", name: `Product ${id}`, description: "" }],
      schedule_slots: [
        { weekday, start_time: "17:00", duration_minutes: 90 },
      ],
    },
  };
}
