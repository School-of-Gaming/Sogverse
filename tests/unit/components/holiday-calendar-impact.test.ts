import { describe, expect, it } from "vitest";
import { summariseHolidayImpact } from "@/components/admin/holiday-calendars/holiday-calendar-impact";
import { holidayCalendarChangePreview } from "@/services/holiday-calendars";

/**
 * What the confirm dialog says per club, shaped from the preview's answer:
 * sessions split at the club's own today, dates deduplicated, records and
 * requests counted by their effect.
 */

const session = (date: string, hour = "15") => ({
  session_date: date,
  starts_at: `${date}T${hour}:00:00+00:00`,
  ends_at: `${date}T${hour}:45:00+00:00`,
});

const PREVIEW = holidayCalendarChangePreview.parse({
  products: [
    {
      product_id: "p-z",
      product_type: "municipality_club",
      timezone: "Europe/Helsinki",
      today: "2030-10-15",
      translations: [
        { locale: "en", name: "Zeta club" },
        { locale: "fi", name: "Zeta-kerho" },
      ],
      removed: [
        session("2030-10-08"),
        session("2030-10-15"),
        session("2030-10-15", "17"),
        session("2030-10-22"),
      ],
      restored: [session("2030-09-01")],
      records: [
        { group_id: "g1", group_name: "A", session_date: "2030-10-08", effect: "hidden" },
        { group_id: "g2", group_name: "B", session_date: "2030-10-08", effect: "hidden" },
        { group_id: "g1", group_name: "A", session_date: "2030-09-01", effect: "shown" },
      ],
      requests: [
        {
          request_id: "r1",
          group_id: "g1",
          group_name: "A",
          session_date: "2030-10-22",
          status: "open",
          effect: "no_session",
        },
      ],
    },
    {
      product_id: "p-a",
      product_type: "consumer_club",
      timezone: "Europe/Helsinki",
      today: "2030-10-15",
      translations: [{ locale: "sv", name: "Alfa klubb" }],
      removed: [],
      restored: [session("2030-11-05")],
      records: [],
      requests: [],
    },
  ],
});

describe("summarising a calendar change", () => {
  const summaries = summariseHolidayImpact(PREVIEW, "fi");

  it("lists the clubs by their name in the reader's locale, falling back", () => {
    expect(summaries.map((s) => s.name)).toEqual(["Alfa klubb", "Zeta-kerho"]);
  });

  it("splits sessions at the club's today, which counts as still to come", () => {
    const zeta = summaries[1];
    expect(zeta.pastRemoved).toEqual(["2030-10-08"]);
    // Two slots on the 15th are one date to a family.
    expect(zeta.futureRemoved).toEqual(["2030-10-15", "2030-10-22"]);
    expect(zeta.pastRestored).toEqual(["2030-09-01"]);
    expect(zeta.futureRestored).toEqual([]);
  });

  it("counts written-up sessions and substitution requests by effect", () => {
    const zeta = summaries[1];
    expect(zeta).toMatchObject({
      recordsHidden: 2,
      recordsShown: 1,
      requestsStopped: 1,
      requestsReopened: 0,
    });
  });

  it("carries only what changed for a club with one kind of change", () => {
    expect(summaries[0]).toEqual({
      productId: "p-a",
      productType: "consumer_club",
      name: "Alfa klubb",
      futureRemoved: [],
      futureRestored: ["2030-11-05"],
      pastRemoved: [],
      pastRestored: [],
      recordsHidden: 0,
      recordsShown: 0,
      requestsStopped: 0,
      requestsReopened: 0,
    });
  });
});
