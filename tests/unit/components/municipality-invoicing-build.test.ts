import { describe, it, expect } from "vitest";
import { buildMunicipalityInvoicing } from "@/components/admin/municipality-invoicing/build-municipality-invoicing";
import type { InvoiceCustomerRow } from "@/services/invoice-customers";
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
    // No Fennoa customer unless a case says otherwise. Null is the ordinary
    // state of a club nobody has agreed a buyer for, and — unlike a null fee —
    // it changes no figure this file asserts on, which is itself something the
    // cases below pin.
    invoice_customer: null,
    sessions: [],
    ...overrides,
  };
}

/** One Fennoa customer, for the cases that need a club to have a buyer. */
function customer(
  id: string,
  overrides: Partial<InvoiceCustomerRow> = {},
): InvoiceCustomerRow {
  return {
    id,
    fennoa_customer_no: `F0${id}`,
    invoice_name: `Customer ${id}`,
    street: "Virastokuja 1",
    postal_code: "02070",
    city: "Espoo",
    country_code: "FI",
    your_reference: null,
    invoice_text: null,
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
  return buildMunicipalityInvoicing({ snapshot, locale, now });
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

  describe("the sessions a club was supposed to run and did not", () => {
    // The count the club's own line carries, so a month's problems are visible
    // without opening a single club. It is on the view model rather than
    // filtered out of the session lines by the component, because it is a
    // definition of "missed" and there has to be exactly one of those.
    it("counts every passed projected date with no stored row", () => {
      // Wednesdays: 2, 9, 16, 23, 30; today is the 16th. Nothing is recorded, so
      // the 2nd and the 9th were missed and the rest are merely still ahead.
      const built = onlyClub([club({ id: "a" })]);

      expect(built.unrecordedCount).toBe(2);
      expect(built.recordedCount).toBe(0);
    });

    it("stops counting a date once a row exists on it", () => {
      const built = onlyClub([
        club({
          id: "a",
          sessions: [{ group_id: "g1", session_date: "2026-09-09" }],
        }),
      ]);

      expect(built.unrecordedCount).toBe(1);
      expect(built.recordedCount).toBe(1);
    });

    it("counts none where every passed date was recorded", () => {
      const built = onlyClub([
        club({
          id: "a",
          sessions: [
            { group_id: "g1", session_date: "2026-09-02" },
            { group_id: "g1", session_date: "2026-09-09" },
          ],
        }),
      ]);

      expect(built.unrecordedCount).toBe(0);
    });

    it("never counts a date still ahead of the club", () => {
      // A club whose term starts after today has projected dates and not one of
      // them is a problem: nothing is wrong with a session nobody has missed.
      const built = onlyClub([club({ id: "a", start_date: "2026-09-20" })]);

      expect(built.sessions.every((s) => s.kind === "upcoming")).toBe(true);
      expect(built.unrecordedCount).toBe(0);
    });

    it("counts none for a club with nothing to project", () => {
      // No weekly slots is no claim, so there is nothing it failed to meet — the
      // page must not report a club with an empty schedule as a club in trouble.
      const built = onlyClub([
        club({
          id: "a",
          schedule_slots: [],
          sessions: [{ group_id: "g1", session_date: "2026-09-09" }],
        }),
      ]);

      expect(built.unrecordedCount).toBe(0);
    });

    it("counts a missed date on a club with no fee, which is two problems", () => {
      // The two warnings are independent: a club can be missing its fee and
      // missing its sessions, and the count is not silenced by the null total.
      const built = onlyClub([
        club({ id: "a", municipality_fee_cents: null }),
      ]);

      expect(built.totalCents).toBeNull();
      expect(built.unrecordedCount).toBe(2);
    });

    it("is counted per club, not shared across a municipality", () => {
      const view = build([
        club({ id: "a", product_translations: [{ locale: "en", name: "A" }] }),
        club({
          id: "b",
          product_translations: [{ locale: "en", name: "B" }],
          sessions: [
            { group_id: "g1", session_date: "2026-09-02" },
            { group_id: "g1", session_date: "2026-09-09" },
          ],
        }),
      ]);

      expect(
        view.municipalities[0].clubs.map((one) => one.unrecordedCount),
      ).toEqual([2, 0]);
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

  describe("the start date is the whole of the has-it-begun rule", () => {
    // There is no lifecycle state anywhere in this arithmetic, and that is the
    // point: a stored one used to gate projection here, it never advanced past
    // its initial value, and the missed-session flagging the page exists for was
    // therefore dead for every club on the invoice.
    it("projects a full month for a club whose term spans it, however long ago it began", () => {
      expect(
        onlyClub([club({ id: "a", start_date: "2020-01-06" })]).sessions,
      ).toHaveLength(5);
    });

    it("projects for a club whose term has already finished, up to its last day", () => {
      const built = onlyClub([club({ id: "a", end_date: "2026-09-09" })]);
      expect(built.sessions.map((session) => session.date)).toEqual([
        "2026-09-02",
        "2026-09-09",
      ]);
    });

    it("projects nothing for a club whose term starts after the month, and keeps its rows", () => {
      const built = onlyClub([
        club({
          id: "a",
          start_date: "2026-11-02",
          end_date: null,
          sessions: [{ group_id: "g1", session_date: "2026-09-09" }],
        }),
      ]);

      expect(built.sessions).toEqual([
        { date: "2026-09-09", isoWeek: 37, kind: "recorded" },
      ]);
      expect(built.totalCents).toBe(8_750);
    });
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
      // Neither club names a buyer and only one is short a fee, so the two
      // counts cannot be standing in for one another here.
      expect(municipality.clubsWithoutCustomer).toBe(2);
    });
  });

  describe("the Fennoa customer a club is invoiced to", () => {
    it("passes the whole customer through untouched", () => {
      // The serializer downstream writes the number, the name and the address
      // into a file, so the builder's job here is to carry the row rather than
      // to reduce it to a flag.
      const buyer = customer("1", {
        fennoa_customer_no: "F0204",
        invoice_name: "Espoon kaupunki",
        your_reference: "TIL-2026-0418",
        invoice_text: "Laskutusviite jokaiselle riville.",
      });
      const built = onlyClub([
        club({
          id: "a",
          invoice_customer: buyer,
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
      ]);

      expect(built.invoiceCustomer).toEqual(buyer);
    });

    it("changes no total when a club has none", () => {
      // The whole point of the separation: a missing buyer blocks a file and
      // touches no money. Same club twice, once with a customer and once
      // without, and every figure has to match.
      const withBuyer = build([
        club({
          id: "a",
          invoice_customer: customer("1"),
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
      ]);
      const without = build([
        club({
          id: "a",
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
      ]);

      expect(without.totalCents).toBe(withBuyer.totalCents);
      expect(without.recordedCount).toBe(withBuyer.recordedCount);
      expect(without.clubsWithoutFee).toBe(0);
      expect(without.municipalities[0].totalCents).toBe(8_750);
      expect(without.municipalities[0].clubs[0].invoiceCustomer).toBeNull();
    });

    it("counts the clubs with no customer at both levels", () => {
      // Across two municipalities, so the month's count is not one
      // municipality's count read twice — the same shape the fee count uses.
      const view = build([
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
        club({
          id: "c",
          municipality: MUNICIPALITY_B,
          invoice_customer: customer("1"),
          sessions: [{ group_id: "g3", session_date: "2026-09-09" }],
        }),
      ]);

      expect(view.clubsWithoutCustomer).toBe(2);
      expect(
        view.municipalities.map((one) => one.clubsWithoutCustomer),
      ).toEqual([1, 1]);
      // And the money is untouched by any of it.
      expect(view.totalCents).toBe(8_750 * 3);
      expect(view.clubsWithoutFee).toBe(0);
    });

    it("keeps a missing fee and a missing customer as two separate counts", () => {
      // One club short a fee, a different club short a buyer. Read as one
      // condition the numbers would both be 2 and the page would say the wrong
      // thing about both clubs.
      const view = build([
        club({
          id: "a",
          municipality_fee_cents: null,
          invoice_customer: customer("1"),
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
        club({
          id: "b",
          sessions: [{ group_id: "g2", session_date: "2026-09-02" }],
        }),
      ]);

      expect(view.clubsWithoutFee).toBe(1);
      expect(view.clubsWithoutCustomer).toBe(1);
      const [municipality] = view.municipalities;
      expect(municipality.clubsWithoutFee).toBe(1);
      expect(municipality.clubsWithoutCustomer).toBe(1);
    });

    it("lets one municipality's clubs be billed to two different customers", () => {
      // The Tampere shape: two departments of one city buying under two
      // agreements. A link derived from the municipality could not express it,
      // and this is the case that says so.
      const library = customer("1", { fennoa_customer_no: "F0211" });
      const schools = customer("2", { fennoa_customer_no: "F0212" });
      const view = build([
        club({
          id: "a",
          invoice_customer: library,
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
        club({
          id: "b",
          invoice_customer: schools,
          sessions: [{ group_id: "g2", session_date: "2026-09-02" }],
        }),
      ]);

      expect(view.municipalities).toHaveLength(1);
      expect(
        view.municipalities[0].clubs.map(
          (one) => one.invoiceCustomer?.fennoa_customer_no,
        ),
      ).toEqual(["F0211", "F0212"]);
      expect(view.municipalities[0].clubsWithoutCustomer).toBe(0);
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

  describe("a club with no weekly slots", () => {
    // Staging had no such club and production does: a municipality club whose
    // schedule was never filled in, or was emptied after the term started. It
    // is on the invoice on the strength of its stored rows alone, and the one
    // thing the page must not do is fall over on it — a single club with no
    // slots would otherwise take the whole month's invoice down with it.
    const slotless = () =>
      club({
        id: "a",
        schedule_slots: [],
        sessions: [
          { group_id: "g1", session_date: "2026-09-02" },
          { group_id: "g1", session_date: "2026-09-09" },
        ],
      });

    it("builds without throwing, and bills its stored rows", () => {
      const built = onlyClub([slotless()]);

      expect(built.recordedCount).toBe(2);
      expect(built.totalCents).toBe(2 * 8_750);
      expect(built.sessions.map((s) => s.date)).toEqual([
        "2026-09-02",
        "2026-09-09",
      ]);
    });

    it("has no schedule summary rather than an empty one", () => {
      // The summary line is omitted entirely — not printed blank, and not
      // printed as a weekday list with nothing in it. The component hangs the
      // club's "where and when" line on this being null.
      expect(onlyClub([slotless()]).scheduleSummary).toBeNull();
    });

    it("projects nothing, so it contributes no unrecorded lines", () => {
      const built = onlyClub([slotless()]);

      expect(built.sessions.every((s) => s.kind === "recorded")).toBe(true);
    });

    it("is left off the invoice when it has no rows either", () => {
      // Nothing stored and nothing to project is a club that did nothing in a
      // month it may not even have been running in. An empty row would say
      // otherwise.
      const view = build([club({ id: "a", schedule_slots: [], sessions: [] })]);

      expect(view.municipalities).toHaveLength(0);
      expect(view.totalCents).toBe(0);
    });
  });

  describe("the month's own total", () => {
    it("sums every municipality, and counts what it is made of", () => {
      const view = build([
        club({
          id: "a",
          municipality: MUNICIPALITY_A,
          municipality_fee_cents: 8_750,
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
        club({
          id: "b",
          municipality: MUNICIPALITY_A,
          municipality_fee_cents: 3_333,
          sessions: [
            { group_id: "g2", session_date: "2026-09-02" },
            { group_id: "g2", session_date: "2026-09-09" },
          ],
        }),
        club({
          id: "c",
          municipality: MUNICIPALITY_B,
          municipality_fee_cents: 5_000,
          sessions: [{ group_id: "g3", session_date: "2026-09-16" }],
        }),
      ]);

      expect(view.totalCents).toBe(8_750 + 6_666 + 5_000);
      expect(view.municipalityCount).toBe(2);
      expect(view.clubCount).toBe(3);
      expect(view.recordedCount).toBe(4);
      expect(view.clubsWithoutFee).toBe(0);
    });

    it("agrees with the municipality totals it stands over", () => {
      // Pinned as literals rather than re-summed from the view: a total checked
      // against a sum of the same numbers the same function produced would pass
      // for any arithmetic at all, including none.
      const view = build([
        club({
          id: "a",
          municipality: MUNICIPALITY_A,
          municipality_fee_cents: 8_750,
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
        club({
          id: "b",
          municipality: MUNICIPALITY_B,
          municipality_fee_cents: 5_000,
          sessions: [
            { group_id: "g2", session_date: "2026-09-02" },
            { group_id: "g2", session_date: "2026-09-09" },
          ],
        }),
      ]);

      expect(view.municipalities.map((one) => one.totalCents)).toEqual([
        8_750,
        10_000,
      ]);
      expect(view.totalCents).toBe(18_750);
    });

    it("leaves every club with no fee out of the total and says how many", () => {
      // Across two municipalities, so the month's count is not just one
      // municipality's count read twice.
      const view = build([
        club({
          id: "a",
          municipality: MUNICIPALITY_A,
          municipality_fee_cents: null,
          sessions: [{ group_id: "g1", session_date: "2026-09-02" }],
        }),
        club({
          id: "b",
          municipality: MUNICIPALITY_B,
          municipality_fee_cents: null,
          sessions: [{ group_id: "g2", session_date: "2026-09-02" }],
        }),
        club({
          id: "c",
          municipality: MUNICIPALITY_B,
          municipality_fee_cents: 5_000,
          sessions: [{ group_id: "g3", session_date: "2026-09-09" }],
        }),
      ]);

      expect(view.totalCents).toBe(5_000);
      expect(view.clubsWithoutFee).toBe(2);
      // The recorded count is not the billed count: a session that ran with no
      // fee set still ran, and hiding it would hide the thing to fix.
      expect(view.recordedCount).toBe(3);
    });

    it("counts a municipality's recorded sessions across its clubs", () => {
      const view = build([
        club({
          id: "a",
          municipality: MUNICIPALITY_A,
          sessions: [
            { group_id: "g1", session_date: "2026-09-02" },
            { group_id: "g1", session_date: "2026-09-09" },
          ],
        }),
        club({
          id: "b",
          municipality: MUNICIPALITY_A,
          sessions: [{ group_id: "g2", session_date: "2026-09-09" }],
        }),
      ]);

      expect(view.municipalities[0].recordedCount).toBe(3);
    });

    it("is zero for a month with nothing in it", () => {
      const view = build([]);

      expect(view.totalCents).toBe(0);
      expect(view.municipalityCount).toBe(0);
      expect(view.clubCount).toBe(0);
      expect(view.recordedCount).toBe(0);
      expect(view.clubsWithoutFee).toBe(0);
      expect(view.clubsWithoutCustomer).toBe(0);
    });
  });
});
