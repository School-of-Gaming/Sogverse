import { describe, it, expect } from "vitest";
import {
  buildGeduInvoicing,
  staffingInputs,
  type GeduInvoice,
} from "@/components/gedu-invoicing/build-gedu-invoicing";
import {
  GEDU_INVOICING_NOW,
  GEDU_INVOICING_VIEWER_ID,
  GEDU_INVOICING_WORKING_MONTH,
  geduInvoicingMonthFixture,
} from "@/components/gedu-invoicing/mock-gedu-invoicing-fixtures";
import { deriveSessionStaffing } from "@/lib/session-staffing";
import type {
  GeduInvoicingGedu,
  GeduInvoicingGroup,
  GeduInvoicingProduct,
  GeduInvoicingSnapshot,
} from "@/services/gedu-invoicing";

/**
 * The document → gedu invoice mapping: which seats a gedu is paid for, in which
 * role, at which fee, and what their month comes to.
 *
 * September 2026 throughout, with the clock pinned to Wednesday the 16th
 * mid-afternoon in Helsinki, so a weekly Wednesday club has two dates behind
 * today (2nd, 9th), today itself (16th) and two ahead (23rd, 30th).
 */

const HELSINKI = "Europe/Helsinki";
const MONTH = "2026-09-01";
const NOW = new Date("2026-09-16T15:00:00+03:00");

const AINO = "0b7c5f0e-5d0a-4a47-9b8e-4f6c1c2f0a01";
const BENJAMIN = "3f2a9d61-8b1e-4c55-a0f2-7d9e6b4c1a02";
const CELIA = "9a41c7e2-2f6d-4b83-8e15-c0d7a3b95e03";

/** The other party a request names, as the document carries them. */
const CELIA_ROW = { id: CELIA, first_name: "Celia", last_name: "Covers" };
const CELIA_PERSON = { id: CELIA, firstName: "Celia", lastName: "Covers" };

function product(
  overrides: Partial<GeduInvoicingProduct> & { id: string },
): GeduInvoicingProduct {
  return {
    product_type: "municipality_club",
    timezone: HELSINKI,
    start_date: "2026-08-10",
    end_date: "2026-12-18",
    primary_gedu_fee_cents: 6_000,
    assistant_gedu_fee_cents: 4_000,
    product_translations: [{ locale: "en", name: `Club ${overrides.id}` }],
    // Wednesdays (weekday 2): 2, 9, 16, 23, 30 September.
    schedule_slots: [{ weekday: 2, start_time: "16:00", duration_minutes: 90 }],
    location: {
      id: "loc-school",
      name: "Test School",
      name_i18n: null,
      type: "site",
    },
    municipality: { id: "loc-espoo", name: "Espoo", name_i18n: { sv: "Esbo" } },
    ...overrides,
  };
}

function group(
  overrides: Partial<GeduInvoicingGroup> & { id: string; product_id: string },
): GeduInvoicingGroup {
  return {
    name: `Group ${overrides.id}`,
    sessions: [],
    cancelled_sessions: [],
    ...overrides,
  };
}

function gedu(
  overrides: Partial<GeduInvoicingGedu> & { id: string },
): GeduInvoicingGedu {
  return {
    first_name: overrides.id === BENJAMIN ? "Benjamin" : "Aino",
    last_name: "Tester",
    assignments: [],
    substitutions: [],
    absences: [],
    ...overrides,
  };
}

function build(
  parts: Omit<GeduInvoicingSnapshot, "month_start">,
  now: Date = NOW,
) {
  return buildGeduInvoicing({
    snapshot: { month_start: MONTH, ...parts },
    locale: "en",
    now,
  });
}

function geduOf(view: ReturnType<typeof build>, id: string): GeduInvoice {
  const found = view.gedus.find((one) => one.id === id);
  if (found === undefined) throw new Error(`no gedu ${id} on the view`);
  return found;
}

/** Kinds by date, for one club's lines. */
function kinds(club: GeduInvoice["clubs"][number]) {
  return club.lines.map((line) => [line.date, line.kind]);
}

describe("buildGeduInvoicing", () => {
  describe("who is paid, and in which role", () => {
    it("pays the primary and the assistant of one session each their own fee", () => {
      const view = build({
        gedus: [
          gedu({ id: AINO, assignments: [{ group_id: "g1", role: "primary" }] }),
          gedu({
            id: BENJAMIN,
            assignments: [{ group_id: "g1", role: "assistant" }],
          }),
        ],
        groups: [group({ id: "g1", product_id: "p1", sessions: ["2026-09-09"] })],
        products: [product({ id: "p1" })],
      });

      const aino = geduOf(view, AINO);
      const ben = geduOf(view, BENJAMIN);
      expect(aino.clubs).toHaveLength(1);
      expect(aino.clubs[0]).toMatchObject({ role: "primary", paidCount: 1, totalCents: 6_000 });
      expect(ben.clubs[0]).toMatchObject({ role: "assistant", paidCount: 1, totalCents: 4_000 });
      expect(aino.totalCents).toBe(6_000);
      expect(ben.totalCents).toBe(4_000);
    });

    it("pays a sub in the role recorded on the substitution", () => {
      // Benjamin is not assigned to g1 at all; he subbed a primary on the 9th.
      const view = build({
        gedus: [
          gedu({
            id: BENJAMIN,
            assignments: [{ group_id: "g2", role: "assistant" }],
            substitutions: [
              {
                request_id: "r1",
                group_id: "g1",
                session_date: "2026-09-09",
                role: "primary",
                absent_gedu: CELIA_ROW,
              },
            ],
          }),
        ],
        groups: [
          group({ id: "g1", product_id: "p1", sessions: ["2026-09-02", "2026-09-09"] }),
          group({ id: "g2", product_id: "p2" }),
        ],
        products: [product({ id: "p1" }), product({ id: "p2", schedule_slots: [] })],
      });

      const ben = geduOf(view, BENJAMIN);
      // Only the date he was booked for: the 2nd was somebody else's seat.
      expect(ben.clubs).toHaveLength(1);
      expect(ben.clubs[0]).toMatchObject({
        productId: "p1",
        role: "primary",
        paidCount: 1,
        totalCents: 6_000,
      });
      expect(kinds(ben.clubs[0])).toEqual([["2026-09-09", "paid"]]);
      // And the line names whom he covered for.
      expect(ben.clubs[0].lines[0].coveringFor).toEqual(CELIA_PERSON);
    });

    it("does not pay the absent gedu, and does not flag the date missed", () => {
      const view = build({
        gedus: [
          gedu({
            id: AINO,
            assignments: [{ group_id: "g1", role: "primary" }],
            absences: [
              {
                request_id: "r1",
                group_id: "g1",
                session_date: "2026-09-09",
                role: "primary",
                status: "substituted",
                substitute: CELIA_ROW,
              },
              {
                request_id: "r2",
                group_id: "g1",
                session_date: "2026-09-02",
                role: "primary",
                status: "open",
                substitute: null,
              },
            ],
          }),
        ],
        groups: [group({ id: "g1", product_id: "p1", sessions: ["2026-09-09"] })],
        products: [product({ id: "p1" })],
      });

      const club = geduOf(view, AINO).clubs[0];
      expect(club.paidCount).toBe(0);
      expect(club.unrecordedCount).toBe(0);
      expect(club.lines.slice(0, 2)).toMatchObject([
        { date: "2026-09-02", kind: "absent", substitute: null, coveringFor: null },
        { date: "2026-09-09", kind: "absent", substitute: CELIA_PERSON, coveringFor: null },
      ]);
    });

    it("counts two groups of one club on one date as two seats", () => {
      // Aino is assigned to g1 and subs g2 of the same club on the 9th.
      const view = build({
        gedus: [
          gedu({
            id: AINO,
            assignments: [{ group_id: "g1", role: "primary" }],
            substitutions: [
              { request_id: "r1", group_id: "g2", session_date: "2026-09-09", role: "primary", absent_gedu: CELIA_ROW },
            ],
          }),
        ],
        groups: [
          group({ id: "g1", product_id: "p1", sessions: ["2026-09-09"] }),
          group({ id: "g2", product_id: "p1", sessions: ["2026-09-09"] }),
        ],
        products: [product({ id: "p1" })],
      });

      const aino = geduOf(view, AINO);
      expect(aino.clubs).toHaveLength(1);
      expect(aino.clubs[0].paidCount).toBe(2);
      expect(aino.clubs[0].totalCents).toBe(12_000);
    });
  });

  describe("the substitution mapping", () => {
    it("hands the derivation the real absent gedu and the real sub", () => {
      const aino = gedu({
        id: AINO,
        substitutions: [
          { request_id: "r1", group_id: "g1", session_date: "2026-09-09", role: "assistant", absent_gedu: CELIA_ROW },
        ],
      });
      const inputs = staffingInputs(aino, "g1");

      expect(inputs.gedus).toEqual([]);
      expect(inputs.requests).toEqual([
        {
          id: "r1",
          sessionDate: "2026-09-09",
          requestedBy: { id: CELIA, firstName: "Celia" },
          role: "assistant",
          status: "substituted",
          substituteId: { id: AINO, firstName: "Aino" },
        },
      ]);
      // And the derivation reads it as intended: the sub is expected, in the
      // substitution's role.
      expect(
        deriveSessionStaffing({ ...inputs, sessionDate: "2026-09-09" }).expected,
      ).toEqual([{ id: AINO, firstName: "Aino", role: "assistant" }]);
    });

    it("takes a sub who then filed their own absence out of the seat", () => {
      const view = build({
        gedus: [
          gedu({
            id: AINO,
            substitutions: [
              { request_id: "r1", group_id: "g1", session_date: "2026-09-09", role: "primary", absent_gedu: CELIA_ROW },
            ],
            absences: [
              {
                request_id: "r2",
                group_id: "g1",
                session_date: "2026-09-09",
                role: "primary",
                status: "substituted",
                substitute: { id: BENJAMIN, first_name: "Benjamin", last_name: "Tester" },
              },
            ],
          }),
        ],
        groups: [group({ id: "g1", product_id: "p1", sessions: ["2026-09-09"] })],
        products: [product({ id: "p1" })],
      });

      const club = geduOf(view, AINO).clubs[0];
      expect(kinds(club)).toEqual([["2026-09-09", "absent"]]);
      // A → Aino → Benjamin: her line says who took it on from her, and whom
      // she had been covering for.
      expect(club.lines[0]).toMatchObject({
        substitute: { id: BENJAMIN, firstName: "Benjamin", lastName: "Tester" },
        coveringFor: CELIA_PERSON,
      });
      expect(club.paidCount).toBe(0);
    });
  });

  describe("dates against the product's own today", () => {
    function assigned(sessions: string[], overrides: Partial<GeduInvoicingProduct> = {}) {
      return {
        gedus: [gedu({ id: AINO, assignments: [{ group_id: "g1", role: "primary" as const }] })],
        groups: [group({ id: "g1", product_id: "p1", sessions })],
        products: [product({ id: "p1", ...overrides })],
      };
    }

    it("flags a passed date with no row as unrecorded and pays nothing for it", () => {
      const club = geduOf(build(assigned(["2026-09-09"])), AINO).clubs[0];
      expect(kinds(club)).toEqual([
        ["2026-09-02", "unrecorded"],
        ["2026-09-09", "paid"],
        ["2026-09-16", "upcoming"],
        ["2026-09-23", "upcoming"],
        ["2026-09-30", "upcoming"],
      ]);
      expect(club.unrecordedCount).toBe(1);
      expect(club.totalCents).toBe(6_000);
    });

    it("does not pay a stored row dated after today", () => {
      const club = geduOf(build(assigned(["2026-09-23"])), AINO).clubs[0];
      expect(club.lines.find((line) => line.date === "2026-09-23")?.kind).toBe("upcoming");
      expect(club.paidCount).toBe(0);
    });

    it("pays today's stored row", () => {
      const club = geduOf(build(assigned(["2026-09-16"])), AINO).clubs[0];
      expect(club.lines.find((line) => line.date === "2026-09-16")?.kind).toBe("paid");
      expect(club.paidCount).toBe(1);
    });

    it("reads today in the product's zone near midnight", () => {
      // 23:30 UTC on the 15th is 02:30 on the 16th in Helsinki: the 16th's row
      // has happened there, though the UTC date is still the 15th.
      const club = geduOf(
        build(assigned(["2026-09-16"]), new Date("2026-09-15T23:30:00Z")),
        AINO,
      ).clubs[0];
      expect(club.lines.find((line) => line.date === "2026-09-16")?.kind).toBe("paid");
    });

    it("renders stored rows alone for a product with no slots", () => {
      const club = geduOf(
        build(assigned(["2026-09-04"], { schedule_slots: [] })),
        AINO,
      ).clubs[0];
      expect(kinds(club)).toEqual([["2026-09-04", "paid"]]);
    });

    it("pays a stored row the schedule never projected", () => {
      const club = geduOf(build(assigned(["2026-09-04"])), AINO).clubs[0];
      expect(club.lines.find((line) => line.date === "2026-09-04")?.kind).toBe("paid");
    });
  });

  describe("cancellations", () => {
    it("shows a cancelled date at zero and never as missed", () => {
      // The 2nd was cancelled — past, no row — and the 9th ran. Recorded beside
      // a cancelled pair is impossible on the wire: the row is left out of
      // `sessions`, so the cancellation is all the builder sees.
      const view = build({
        gedus: [gedu({ id: AINO, assignments: [{ group_id: "g1", role: "primary" }] })],
        groups: [
          group({
            id: "g1",
            product_id: "p1",
            sessions: ["2026-09-09"],
            cancelled_sessions: ["2026-09-02", "2026-09-23"],
          }),
        ],
        products: [product({ id: "p1" })],
      });

      const club = geduOf(view, AINO).clubs[0];
      expect(kinds(club)).toEqual([
        ["2026-09-02", "cancelled"],
        ["2026-09-09", "paid"],
        ["2026-09-16", "upcoming"],
        ["2026-09-23", "cancelled"],
        ["2026-09-30", "upcoming"],
      ]);
      expect(club.unrecordedCount).toBe(0);
      expect(club.paidCount).toBe(1);
    });

    it("renders no line for a cancellation nothing claims", () => {
      const view = build({
        gedus: [gedu({ id: AINO, assignments: [{ group_id: "g1", role: "primary" }] })],
        groups: [group({ id: "g1", product_id: "p1", cancelled_sessions: ["2026-09-04"] })],
        products: [product({ id: "p1" })],
      });
      const club = geduOf(view, AINO).clubs[0];
      expect(club.lines.some((line) => line.date === "2026-09-04")).toBe(false);
    });
  });

  describe("an absence the schedule does not project", () => {
    // Friday the 4th: the weekly Wednesday slot never lands on it, and no row
    // was stored — Celia's page shows it, so Aino's must too.
    function absentOnThe4th(cancelled: string[]) {
      return build({
        gedus: [
          gedu({
            id: AINO,
            assignments: [{ group_id: "g1", role: "primary" }],
            absences: [
              {
                request_id: "r1",
                group_id: "g1",
                session_date: "2026-09-04",
                role: "primary",
                status: "substituted",
                substitute: CELIA_ROW,
              },
            ],
          }),
          gedu({
            id: CELIA,
            substitutions: [
              {
                request_id: "r1",
                group_id: "g1",
                session_date: "2026-09-04",
                role: "primary",
                absent_gedu: { id: AINO, first_name: "Aino", last_name: "Tester" },
              },
            ],
          }),
        ],
        groups: [
          group({ id: "g1", product_id: "p1", cancelled_sessions: cancelled }),
        ],
        products: [product({ id: "p1" })],
      });
    }

    function lineOn4th(view: ReturnType<typeof build>, id: string) {
      return geduOf(view, id).clubs[0].lines.find(
        (line) => line.date === "2026-09-04",
      );
    }

    it("renders the absent gedu's line, as the sub's page renders the date", () => {
      const view = absentOnThe4th([]);
      expect(lineOn4th(view, AINO)).toMatchObject({
        kind: "absent",
        substitute: CELIA_PERSON,
      });
      expect(lineOn4th(view, CELIA)?.kind).toBe("unrecorded");
    });

    it("reads cancelled on both pages when the date was cancelled", () => {
      const view = absentOnThe4th(["2026-09-04"]);
      expect(lineOn4th(view, AINO)?.kind).toBe("cancelled");
      expect(lineOn4th(view, CELIA)?.kind).toBe("cancelled");
    });
  });

  describe("fees and money", () => {
    it("leaves an unset fee out of every total and counts it", () => {
      const view = build({
        gedus: [
          gedu({
            id: AINO,
            assignments: [
              { group_id: "g1", role: "primary" },
              { group_id: "g2", role: "primary" },
            ],
          }),
        ],
        groups: [
          group({ id: "g1", product_id: "p1", sessions: ["2026-09-02", "2026-09-09"] }),
          group({ id: "g2", product_id: "p2", sessions: ["2026-09-09"] }),
        ],
        products: [
          product({ id: "p1", primary_gedu_fee_cents: null }),
          product({ id: "p2" }),
        ],
      });

      const aino = geduOf(view, AINO);
      const unset = aino.clubs.find((club) => club.productId === "p1");
      expect(unset).toMatchObject({ feeCents: null, totalCents: null, paidCount: 2 });
      expect(aino.totalCents).toBe(6_000);
      expect(aino.clubsWithoutFee).toBe(1);
      expect(aino.sessionsWithoutFee).toBe(2);
      expect(view.clubsWithoutFee).toBe(1);
      expect(view.sessionsWithoutFee).toBe(2);
      expect(view.totalCents).toBe(6_000);
    });

    it("counts an unpriced club once for the month, however many gedus it has", () => {
      const view = build({
        gedus: [
          gedu({ id: AINO, assignments: [{ group_id: "g1", role: "primary" }] }),
          gedu({ id: BENJAMIN, assignments: [{ group_id: "g2", role: "primary" }] }),
        ],
        groups: [
          group({ id: "g1", product_id: "p1", sessions: ["2026-09-09"] }),
          group({ id: "g2", product_id: "p1", sessions: ["2026-09-02", "2026-09-09"] }),
        ],
        products: [product({ id: "p1", primary_gedu_fee_cents: null })],
      });

      expect(geduOf(view, AINO).clubsWithoutFee).toBe(1);
      expect(geduOf(view, BENJAMIN).clubsWithoutFee).toBe(1);
      // One fee to set, but every seat it left out.
      expect(view.clubsWithoutFee).toBe(1);
      expect(view.sessionsWithoutFee).toBe(3);
    });

    it("pays a fee of zero as a real zero", () => {
      const view = build({
        gedus: [gedu({ id: AINO, assignments: [{ group_id: "g1", role: "assistant" }] })],
        groups: [group({ id: "g1", product_id: "p1", sessions: ["2026-09-09"] })],
        products: [product({ id: "p1", assistant_gedu_fee_cents: 0 })],
      });
      const aino = geduOf(view, AINO);
      expect(aino.clubs[0]).toMatchObject({ feeCents: 0, paidCount: 1, totalCents: 0 });
      expect(aino.clubsWithoutFee).toBe(0);
      expect(aino.sessionsWithoutFee).toBe(0);
    });

    it("splits a gedu's money into municipality and consumer subtotals", () => {
      const view = build({
        gedus: [
          gedu({
            id: AINO,
            assignments: [
              { group_id: "g1", role: "primary" },
              { group_id: "g2", role: "assistant" },
            ],
          }),
        ],
        groups: [
          group({ id: "g1", product_id: "p1", sessions: ["2026-09-02", "2026-09-09"] }),
          group({ id: "g2", product_id: "p2", sessions: ["2026-09-09"] }),
        ],
        products: [
          product({ id: "p1" }),
          product({ id: "p2", product_type: "consumer_club", municipality: null }),
        ],
      });

      const aino = geduOf(view, AINO);
      expect(aino.municipalityTotalCents).toBe(12_000);
      expect(aino.consumerTotalCents).toBe(4_000);
      expect(aino.totalCents).toBe(16_000);
      // Municipality clubs first.
      expect(aino.clubs.map((club) => club.segment)).toEqual(["municipality", "consumer"]);
      expect(aino.clubs[1].municipalityName).toBeNull();
    });

    it("totals the month as the sum of the gedu totals", () => {
      const view = build({
        gedus: [
          gedu({ id: AINO, assignments: [{ group_id: "g1", role: "primary" }] }),
          gedu({ id: BENJAMIN, assignments: [{ group_id: "g1", role: "assistant" }] }),
        ],
        groups: [group({ id: "g1", product_id: "p1", sessions: ["2026-09-02", "2026-09-09"] })],
        products: [product({ id: "p1" })],
      });

      expect(view.totalCents).toBe(
        view.gedus.reduce((sum, one) => sum + one.totalCents, 0),
      );
      expect(view.totalCents).toBe(20_000);
      expect(view.geduCount).toBe(2);
      expect(view.paidCount).toBe(4);
      expect(view.unrecordedCount).toBe(0);
      // By first name.
      expect(view.gedus.map((one) => one.firstName)).toEqual(["Aino", "Benjamin"]);
    });

    it("throws rather than return an unsafe total", () => {
      expect(() =>
        build({
          gedus: [gedu({ id: AINO, assignments: [{ group_id: "g1", role: "primary" }] })],
          groups: [group({ id: "g1", product_id: "p1", sessions: ["2026-09-02", "2026-09-09"] })],
          products: [product({ id: "p1", primary_gedu_fee_cents: Number.MAX_SAFE_INTEGER })],
        }),
      ).toThrow(/safe integer/);
    });
  });

  describe("labels and shape", () => {
    it("names the club by locale with the resolver's fallback, and localizes places", () => {
      const view = buildGeduInvoicing({
        snapshot: {
          month_start: MONTH,
          gedus: [gedu({ id: AINO, assignments: [{ group_id: "g1", role: "primary" }] })],
          groups: [group({ id: "g1", product_id: "p1", sessions: ["2026-09-09"] })],
          products: [
            product({
              id: "p1",
              product_translations: [{ locale: "fi", name: "Pelikerho" }],
            }),
          ],
        },
        locale: "sv",
        now: NOW,
      });
      const club = view.gedus[0].clubs[0];
      expect(club.name).toBe("Pelikerho");
      expect(club.municipalityName).toBe("Esbo");
      expect(club.locationName).toBe("Test School");
    });

    it("leaves a gedu with nothing dated in the month off the view", () => {
      const view = build({
        gedus: [gedu({ id: AINO, assignments: [{ group_id: "g1", role: "primary" }] })],
        groups: [group({ id: "g1", product_id: "p1" })],
        products: [product({ id: "p1", start_date: "2026-10-05" })],
      });
      expect(view.gedus).toEqual([]);
      expect(view.totalCents).toBe(0);
    });
  });

  describe("the preview fixture", () => {
    it("shows every line kind in the working month, and nothing outside it", () => {
      const view = buildGeduInvoicing({
        snapshot: geduInvoicingMonthFixture(GEDU_INVOICING_WORKING_MONTH),
        locale: "en",
        now: GEDU_INVOICING_NOW,
      });
      const seen = new Set(
        view.gedus.flatMap((one) =>
          one.clubs.flatMap((club) => club.lines.map((line) => line.kind)),
        ),
      );
      expect([...seen].sort()).toEqual(
        ["absent", "cancelled", "paid", "unrecorded", "upcoming"],
      );
      expect(view.clubsWithoutFee).toBeGreaterThan(0);
      expect(view.municipalityTotalCents).toBeGreaterThan(0);
      expect(view.consumerTotalCents).toBeGreaterThan(0);

      expect(
        buildGeduInvoicing({
          snapshot: geduInvoicingMonthFixture("2026-06-01"),
          locale: "en",
          now: GEDU_INVOICING_NOW,
        }).gedus,
      ).toEqual([]);
    });

    it("narrows to one gedu the way the gedu's own read does", () => {
      const snapshot = geduInvoicingMonthFixture(
        GEDU_INVOICING_WORKING_MONTH,
        GEDU_INVOICING_VIEWER_ID,
      );
      expect(snapshot.gedus.map((one) => one.id)).toEqual([GEDU_INVOICING_VIEWER_ID]);
      const view = buildGeduInvoicing({ snapshot, locale: "en", now: GEDU_INVOICING_NOW });
      expect(view.gedus).toHaveLength(1);
    });
  });
});
