import { describe, it, expect } from "vitest";
import { buildMunicipalityInvoicing } from "@/components/admin/municipality-invoicing/build-municipality-invoicing";
import type {
  MunicipalityInvoicingClub,
  MunicipalityInvoicingSnapshot,
} from "@/services/municipality-invoicing";

/**
 * The document → invoice mapping, which is where every decision an invoice
 * stands on is actually made: what counts as a session that ran, which
 * scheduled dates were missed, which are merely still ahead, and what all of it
 * comes to in cents.
 *
 * The clock is pinned mid-month so "today" splits the month into a past and a
 * future half with room either side, and one case pins it to an hour where the
 * UTC date and the Helsinki date disagree — the whole reason the comparison is
 * made in the club's own zone rather than in the runtime's.
 *
 * September 2026 is the month throughout: it starts on a Tuesday and ends on a
 * Wednesday, so a weekly slot's first and last occurrences both fall inside it
 * rather than tidily on the edges.
 */

const HELSINKI = "Europe/Helsinki";
const MONTH = "2026-09-01";

/** Wednesday 16 September 2026, mid-afternoon in Helsinki. */
const NOW = new Date("2026-09-16T15:00:00+03:00");

const MUNICIPALITY_A = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Espoo",
  name_i18n: null,
};
const MUNICIPALITY_B = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Helsinki",
  name_i18n: { sv: "Helsingfors" },
};

function club(
  overrides: Partial<MunicipalityInvoicingClub> & { id: string },
): MunicipalityInvoicingClub {
  return {
    status: "running",
    timezone: HELSINKI,
    start_date: "2026-08-10",
    end_date: "2026-12-18",
    municipality_fee_cents: 8_750,
    product_translations: [{ locale: "en", name: `Club ${overrides.id}` }],
    // Wednesdays (weekday 2), which September 2026 has five of: 2, 9, 16, 23, 30.
    schedule_slots: [{ weekday: 2, start_time: "16:00", duration_minutes: 90 }],
    location: {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      name: "Test School",
      name_i18n: null,
      type: "site",
    },
    municipality: MUNICIPALITY_A,
    sessions: [],
    ...overrides,
  };
}

function build(
  clubs: MunicipalityInvoicingClub[],
  now: Date = NOW,
  locale: "en" | "sv" = "en",
) {
  const snapshot: MunicipalityInvoicingSnapshot = {
    month_start: MONTH,
    clubs,
  };
  return buildMunicipalityInvoicing({
    snapshot,
    locale,
    now,
    noMunicipalityLabel: "No municipality",
  });
}

/** The one club of the one municipality, for the single-club cases. */
function onlyClub(clubs: MunicipalityInvoicingClub[], now?: Date) {
  const view = build(clubs, now);
  expect(view.municipalities).toHaveLength(1);
  expect(view.municipalities[0].clubs).toHaveLength(1);
  return view.municipalities[0].clubs[0];
}

describe("buildMunicipalityInvoicing", () => {
  describe("what counts as a session", () => {
    it("counts two groups meeting on one date as one session", () => {
      // The rows arrive one per (group, date) because that is the table's key.
      // A club with two groups that both met on the 2nd ran ONE session and is
      // paid for one; counting the rows would double the invoice.
      const built = onlyClub([
        club({
          id: "a",
          sessions: [
            { group_id: "g1", session_date: "2026-09-02" },
            { group_id: "g2", session_date: "2026-09-02" },
          ],
        }),
      ]);

      expect(built.recordedCount).toBe(1);
      expect(
        built.sessions.filter((s) => s.kind === "recorded").map((s) => s.date),
      ).toEqual(["2026-09-02"]);
      expect(built.totalCents).toBe(8_750);
    });

    it("counts a stored row the schedule never projected", () => {
      // Records beat projections. A club that met on a Friday because the hall
      // was unavailable on the Wednesday still met, and the row is the evidence
      // — so it bills, and it is not reported as anything unusual.
      const built = onlyClub([
        club({
          id: "a",
          sessions: [{ group_id: "g1", session_date: "2026-09-04" }],
        }),
      ]);

      const friday = built.sessions.find((s) => s.date === "2026-09-04");
      expect(friday?.kind).toBe("recorded");
      expect(built.recordedCount).toBe(1);
    });

    it("prefers the record over the projection on a date that has both", () => {
      const built = onlyClub([
        club({
          id: "a",
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
      ]);

      const dates = built.sessions.map((s) => s.date);
      // One line for the 2nd, not two — the projection and the row are the same
      // session met on the same key.
      expect(dates.filter((d) => d === "2026-09-02")).toHaveLength(1);
      expect(
        built.sessions.find((s) => s.date === "2026-09-02")?.kind,
      ).toBe("recorded");
    });
  });

  describe("unrecorded versus upcoming", () => {
    it("splits the projected dates at the club's own today", () => {
      const built = onlyClub([club({ id: "a" })]);

      // Wednesdays in September 2026: 2, 9, 16, 23, 30. "Today" is the 16th, so
      // the 2nd and the 9th were missed, and the 16th is not late yet.
      expect(built.sessions).toEqual([
        { date: "2026-09-02", isoWeek: 36, kind: "unrecorded" },
        { date: "2026-09-09", isoWeek: 37, kind: "unrecorded" },
        { date: "2026-09-16", isoWeek: 38, kind: "upcoming" },
        { date: "2026-09-23", isoWeek: 39, kind: "upcoming" },
        { date: "2026-09-30", isoWeek: 40, kind: "upcoming" },
      ]);
      expect(built.recordedCount).toBe(0);
      expect(built.totalCents).toBe(0);
    });

    it("refuses to bill a stored row dated after the club's today", () => {
      // The database lets a gedu write a note against a session that has not
      // happened yet. Such a row is evidence of nothing, so the 23rd reads as
      // upcoming exactly like the projection it sits on, and only the 9th bills.
      const built = onlyClub([
        club({
          id: "a",
          sessions: [
            { group_id: "g1", session_date: "2026-09-09" },
            { group_id: "g1", session_date: "2026-09-23" },
          ],
        }),
      ]);

      expect(built.sessions.find((s) => s.date === "2026-09-23")?.kind).toBe(
        "upcoming",
      );
      expect(built.recordedCount).toBe(1);
      expect(built.totalCents).toBe(8_750);
    });

    it("bills a stored row dated today", () => {
      // Today is not "after today". An educator writing up the afternoon's
      // session is recording one that ran, and it is on this month's invoice.
      const built = onlyClub([
        club({
          id: "a",
          sessions: [{ group_id: "g1", session_date: "2026-09-16" }],
        }),
      ]);

      expect(built.sessions.find((s) => s.date === "2026-09-16")?.kind).toBe(
        "recorded",
      );
      expect(built.recordedCount).toBe(1);
    });

    it("reads today in the club's zone, not in UTC", () => {
      // 22:30 UTC on Tuesday the 15th is already 01:30 on Wednesday the 16th in
      // Helsinki. The club's Wednesday session is therefore TODAY — not late —
      // and a UTC "today" would have called it missed while it had not started.
      const built = onlyClub(
        [club({ id: "a" })],
        new Date("2026-09-15T22:30:00Z"),
      );

      expect(built.sessions.find((s) => s.date === "2026-09-16")?.kind).toBe(
        "upcoming",
      );
      expect(built.sessions.find((s) => s.date === "2026-09-09")?.kind).toBe(
        "unrecorded",
      );
    });
  });

  describe("the term clips the projection", () => {
    it("starts projecting at the club's start date", () => {
      const built = onlyClub([club({ id: "a", start_date: "2026-09-10" })]);

      expect(built.sessions.map((s) => s.date)).toEqual([
        "2026-09-16",
        "2026-09-23",
        "2026-09-30",
      ]);
    });

    it("stops projecting after the club's end date, inclusive", () => {
      // The 16th is the end date and is a Wednesday, so it is in; the 23rd is
      // past the end and is not.
      const built = onlyClub([club({ id: "a", end_date: "2026-09-16" })]);

      expect(built.sessions.map((s) => s.date)).toEqual([
        "2026-09-02",
        "2026-09-09",
        "2026-09-16",
      ]);
    });

    it("projects nothing for a club with no start date", () => {
      // There is no day to start walking from, and guessing one would invent
      // sessions. Its stored rows still count.
      const built = onlyClub([
        club({
          id: "a",
          start_date: null,
          sessions: [{ group_id: "g1", session_date: "2026-09-09" }],
        }),
      ]);

      expect(built.sessions).toEqual([
        { date: "2026-09-09", isoWeek: 37, kind: "recorded" },
      ]);
    });
  });

  describe("status decides whether there is anything to project", () => {
    it("projects for a completed club", () => {
      expect(
        onlyClub([club({ id: "a", status: "completed" })]).sessions,
      ).toHaveLength(5);
    });

    for (const status of ["pending", "cancelled"] as const) {
      it(`projects nothing for a ${status} club but keeps its rows`, () => {
        const built = onlyClub([
          club({
            id: "a",
            status,
            sessions: [{ group_id: "g1", session_date: "2026-09-09" }],
          }),
        ]);

        expect(built.sessions).toEqual([
          { date: "2026-09-09", isoWeek: 37, kind: "recorded" },
        ]);
        expect(built.totalCents).toBe(8_750);
      });
    }
  });

  describe("a month with nothing in it", () => {
    it("omits a club whose term does not reach the month", () => {
      // The RPC can hand back a club on the strength of a row in another month
      // or a term that has since been edited; a club with nothing in THIS month
      // is not on this invoice, because an empty row would say it did nothing
      // in a month it was never running in.
      const view = build([
        club({ id: "a", start_date: "2026-10-05", end_date: "2026-12-18" }),
      ]);

      expect(view.municipalities).toEqual([]);
    });
  });

  describe("a fee nobody has set", () => {
    it("leaves the club's total null and out of the municipality's", () => {
      const view = build([
        club({
          id: "a",
          municipality_fee_cents: null,
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
        club({
          id: "b",
          sessions: [{ group_id: "g2", session_date: "2026-09-02" }],
        }),
      ]);

      const [municipality] = view.municipalities;
      const [unpriced, priced] = municipality.clubs;
      expect(unpriced.feeCents).toBeNull();
      // Never zero: it recorded a session, and what is unknown is the price.
      expect(unpriced.totalCents).toBeNull();
      expect(unpriced.recordedCount).toBe(1);
      expect(priced.totalCents).toBe(8_750);
      expect(municipality.totalCents).toBe(8_750);
      expect(municipality.clubsWithoutFee).toBe(1);
    });
  });

  describe("grouping and order", () => {
    it("sorts municipalities and their clubs by localized name", () => {
      const view = build([
        club({
          id: "b",
          product_translations: [{ locale: "en", name: "Zebra club" }],
          municipality: MUNICIPALITY_A,
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
        club({
          id: "a",
          product_translations: [{ locale: "en", name: "Alpha club" }],
          municipality: MUNICIPALITY_A,
          sessions: [{ group_id: "g2", session_date: "2026-09-02" }],
        }),
        club({
          id: "c",
          municipality: MUNICIPALITY_B,
          sessions: [{ group_id: "g3", session_date: "2026-09-02" }],
        }),
      ]);

      expect(view.municipalities.map((m) => m.name)).toEqual([
        "Espoo",
        "Helsinki",
      ]);
      expect(view.municipalities[0].clubs.map((c) => c.name)).toEqual([
        "Alpha club",
        "Zebra club",
      ]);
    });

    it("sorts by the name the reader sees, not by the stored one", () => {
      // Helsinki is Helsingfors in Swedish, which sorts before Espoo where
      // Helsinki sorts after it. A sort on the canonical column would hand a
      // Swedish reader a list that is not in alphabetical order for them.
      const view = build(
        [
          club({
            id: "a",
            municipality: MUNICIPALITY_A,
            sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
          }),
          club({
            id: "b",
            municipality: MUNICIPALITY_B,
            sessions: [{ group_id: "g2", session_date: "2026-09-02" }],
          }),
        ],
        NOW,
        "sv",
      );

      expect(view.municipalities.map((m) => m.name)).toEqual([
        "Espoo",
        "Helsingfors",
      ]);
    });

    it("puts the clubs with no municipality in a trailing bucket", () => {
      const view = build([
        club({
          id: "a",
          municipality: null,
          location: null,
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
        club({
          id: "b",
          municipality: MUNICIPALITY_B,
          sessions: [{ group_id: "g2", session_date: "2026-09-02" }],
        }),
      ]);

      // Last, despite "No municipality" sorting before "Helsinki": it is a list
      // of things to fix rather than a municipality to invoice.
      expect(view.municipalities.map((m) => m.name)).toEqual([
        "Helsinki",
        "No municipality",
      ]);
      expect(view.municipalities[1].id).toBeNull();
      expect(view.municipalities[1].clubs[0].locationName).toBeNull();
    });

    it("orders every club's sessions by date", () => {
      const built = onlyClub([
        club({
          id: "a",
          sessions: [
            { group_id: "g1", session_date: "2026-09-23" },
            { group_id: "g1", session_date: "2026-09-04" },
          ],
        }),
      ]);

      expect(built.sessions.map((s) => s.date)).toEqual([
        "2026-09-02",
        "2026-09-04",
        "2026-09-09",
        "2026-09-16",
        "2026-09-23",
        "2026-09-30",
      ]);
    });
  });

  describe("cents", () => {
    it("multiplies and sums exactly at a realistic fee", () => {
      // 87,50 € a session, four sessions: 350,00 €. Every step is an integer
      // number of cents, so there is no rounding for two of them to disagree
      // about — 4 × 87.5 in euros would have been fine here and is not the
      // point; the point is that nothing ever divides before it sums.
      //
      // All four dates are on or before the club's today, because a row dated
      // ahead of its own session does not bill and would make this a case about
      // that rule instead of about the arithmetic.
      const view = build([
        club({
          id: "a",
          municipality_fee_cents: 8_750,
          sessions: [
            { group_id: "g1", session_date: "2026-09-02" },
            { group_id: "g1", session_date: "2026-09-04" },
            { group_id: "g1", session_date: "2026-09-09" },
            { group_id: "g1", session_date: "2026-09-16" },
          ],
        }),
      ]);

      expect(view.municipalities[0].clubs[0].totalCents).toBe(35_000);
      expect(view.municipalities[0].totalCents).toBe(35_000);
    });

    it("sums a municipality's clubs in cents", () => {
      const view = build([
        club({
          id: "a",
          municipality_fee_cents: 8_750,
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
        club({
          id: "b",
          municipality_fee_cents: 3_333,
          sessions: [
            { group_id: "g2", session_date: "2026-09-02" },
            { group_id: "g2", session_date: "2026-09-09" },
          ],
        }),
      ]);

      expect(view.municipalities[0].totalCents).toBe(8_750 + 6_666);
    });
  });
});
