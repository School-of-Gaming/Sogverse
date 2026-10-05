import { describe, it, expect } from "vitest";
import {
  buildFinvoiceForPeriod,
  buildFinvoiceInvoice,
  customerFilesForMonth,
  customerMonths,
  finvoiceFileName,
  finvoiceFileState,
  finvoiceHref,
  serializeFinvoice,
  vatOf,
  type FinvoiceInvoice,
} from "@/lib/finvoice";
import { buildMunicipalityInvoicing } from "@/components/admin/municipality-invoicing/build-municipality-invoicing";
import type { InvoiceCustomerRow } from "@/services/invoice-customers";
import type {
  MunicipalityInvoicingClub,
  MunicipalityInvoicingSnapshot,
} from "@/services/municipality-invoicing";

/**
 * The Finvoice export: one customer's month, and the document it becomes.
 *
 * Two things are being pinned here and they fail differently. The **money** is
 * pinned because a file that does not foot is a file the buyer's accounts
 * payable rejects by hand, weeks later — the case that matters is three
 * identical rows, where rounding the invoice in one step and rounding the rows
 * separately give answers a cent apart, and the previous system took the wrong
 * one. The **document** is pinned because Fennoa's import is not a
 * specification we can re-read: the structure asserted below is the structure
 * of files that were actually imported, so a change to it is a change that has
 * to be re-verified against Fennoa rather than reasoned about.
 *
 * May 2026 throughout, with the clock pinned to Thursday the 21st in Helsinki,
 * so a month's Mondays fall either side of "today": the 4th, 11th and 18th were
 * due and bill whether or not anybody wrote them up, and the 25th is still
 * ahead and bills nothing.
 */

const HELSINKI = "Europe/Helsinki";
const MONTH = "2026-05-01";

/** Thursday 21 May 2026, mid-morning in Helsinki. */
const NOW = new Date("2026-05-21T10:40:00+03:00");

/** When the file was written — the one value in it that is not the month's. */
const GENERATED_AT = new Date("2026-06-03T09:12:34+03:00");

const ESPOO = {
  id: "mun-espoo",
  name: "Espoo",
  name_i18n: null,
};
const HELSINKI_CITY = {
  id: "mun-helsinki",
  name: "Helsinki",
  name_i18n: null,
};

function customer(
  overrides: Partial<InvoiceCustomerRow> & { id: string },
): InvoiceCustomerRow {
  return {
    fennoa_customer_no: "F0204",
    invoice_name: "Espoon kaupunki",
    street: "Virastokuja 1",
    postal_code: "02070",
    city: "Espoo",
    country_code: "FI",
    your_reference: null,
    invoice_text: null,
    billing_cadence: "monthly",
    ...overrides,
  };
}

const ESPOO_CUSTOMER = customer({
  id: "cust-espoo",
  your_reference: "TIL-2026-0418",
});

interface ClubSpec {
  id: string;
  name: string;
  municipality?: MunicipalityInvoicingClub["municipality"];
  /** A hall, or the municipality itself for a remote club, or nowhere. */
  location?: MunicipalityInvoicingClub["location"];
  feeCents?: number | null;
  invoiceCustomer?: InvoiceCustomerRow | null;
  /**
   * Monday 14:15 for 75 minutes unless a case wants something else. An empty
   * list projects nothing, so the club bills its stored rows and no more.
   */
  slots?: MunicipalityInvoicingClub["schedule_slots"];
  /** Dates with a stored row. Mondays in May 2026 are 4, 11, 18 and 25. */
  dates?: readonly string[];
  /** Dates an admin cancelled for the club's one group. */
  cancelled?: readonly string[];
  /** The term's last day — the end of May unless a case stops it earlier. */
  endDate?: string;
}

function club(spec: ClubSpec): MunicipalityInvoicingClub {
  return {
    id: spec.id,
    timezone: HELSINKI,
    start_date: "2026-01-12",
    end_date: spec.endDate ?? "2026-05-29",
    municipality_fee_cents: spec.feeCents === undefined ? 6_500 : spec.feeCents,
    product_translations: [{ locale: "fi", name: spec.name }],
    schedule_slots: spec.slots ?? [
      { weekday: 0, start_time: "14:15", duration_minutes: 75 },
    ],
    location:
      spec.location === undefined
        ? {
            id: `${spec.id}-location`,
            name: "Purolan koulu",
            name_i18n: null,
            type: "site",
          }
        : spec.location,
    municipality: spec.municipality ?? ESPOO,
    invoice_customer:
      spec.invoiceCustomer === undefined ? ESPOO_CUSTOMER : spec.invoiceCustomer,
    sessions: (spec.dates ?? ["2026-05-04"]).map((date) => ({
      group_id: `${spec.id}-g1`,
      session_date: date,
    })),
    cancelled_sessions: (spec.cancelled ?? []).map((date) => ({
      group_id: `${spec.id}-g1`,
      session_date: date,
    })),
    group_ids: [`${spec.id}-g1`],
  };
}

function snapshotOf(clubs: MunicipalityInvoicingClub[]): MunicipalityInvoicingSnapshot {
  return { month_start: MONTH, clubs };
}

function buildFor(
  clubs: MunicipalityInvoicingClub[],
  customerId: string = ESPOO_CUSTOMER.id,
) {
  return buildFinvoiceForPeriod({
    monthStart: MONTH,
    snapshots: [snapshotOf(clubs)],
    customerId,
    now: NOW,
  });
}

/** The invoice, or a failure naming the refusal instead of a `undefined` deref. */
function invoiceFor(
  clubs: MunicipalityInvoicingClub[],
  customerId: string = ESPOO_CUSTOMER.id,
): FinvoiceInvoice {
  const result = buildFor(clubs, customerId);
  if (!result.ok) {
    throw new Error(`expected an invoice, got a refusal: ${result.reason}`);
  }
  return result.invoice;
}

/** Every Monday of May 2026 that has passed by the pinned clock. */
const ALL_DUE_MONDAYS = ["2026-05-04", "2026-05-11", "2026-05-18"] as const;

// ---------------------------------------------------------------------------
// The money
// ---------------------------------------------------------------------------

describe("the money rule", () => {
  it("rounds one row's VAT half up at the standard Finnish rate", () => {
    // 65.00 at 25.5 % is 16.575, which is the awkward half-cent the whole rule
    // exists for. Half up is 16.58. No slots, so the one stored row is the one
    // session billed.
    const invoice = invoiceFor([
      club({ id: "a", name: "Peliklubi Purola", slots: [] }),
    ]);

    expect(invoice.rows).toHaveLength(1);
    expect(invoice.rows[0].netCents).toBe(6_500);
    expect(invoice.rows[0].vatCents).toBe(1_658);
    expect(invoice.rows[0].grossCents).toBe(8_158);
  });

  it("totals three identical rows to 49.74, not the 49.73 a single rounding gives", () => {
    // The one case that proves the totals are the sums of the rows. Three rows
    // of 65.00 are 195.00 net; rounding the rows gives 3 × 16.58 = 49.74, and
    // rounding the invoice in one step gives 49.73. The buyer's system adds the
    // rows, so 49.74 is the answer that foots — and 49.73 is what the previous
    // system's files carried.
    const invoice = invoiceFor([
      club({ id: "a", name: "Klubi A", slots: [] }),
      club({ id: "b", name: "Klubi B", slots: [] }),
      club({ id: "c", name: "Klubi C", slots: [] }),
    ]);

    expect(invoice.rows.map((row) => row.vatCents)).toEqual([1_658, 1_658, 1_658]);
    expect(invoice.netCents).toBe(19_500);
    expect(invoice.vatCents).toBe(4_974);
    expect(vatOf(19_500)).toBe(4_973);
    expect(invoice.grossCents).toBe(24_474);
  });

  it("foots across mixed fees and mixed session counts", () => {
    const invoice = invoiceFor([
      club({ id: "a", name: "Klubi A", feeCents: 8_000, dates: ["2026-05-04"] }),
      club({
        id: "b",
        name: "Klubi B",
        feeCents: 4_550,
        dates: ["2026-05-04", "2026-05-11", "2026-05-18"],
      }),
      club({
        id: "c",
        name: "Klubi C",
        feeCents: 10_000,
        dates: ["2026-05-04", "2026-05-11"],
      }),
    ]);

    const sum = (pick: (row: (typeof invoice.rows)[number]) => number) =>
      invoice.rows.reduce((total, row) => total + pick(row), 0);

    expect(invoice.netCents).toBe(sum((row) => row.netCents));
    expect(invoice.vatCents).toBe(sum((row) => row.vatCents));
    expect(invoice.grossCents).toBe(sum((row) => row.grossCents));
    expect(invoice.grossCents).toBe(invoice.netCents + invoice.vatCents);
    for (const row of invoice.rows) {
      expect(row.netCents).toBe(row.sessions * row.unitPriceCents);
      expect(row.grossCents).toBe(row.netCents + row.vatCents);
    }
  });

  it("bills every session that was due, recorded or not, and none still ahead", () => {
    // Four Mondays in May: two written up, one nobody wrote up, and one still
    // ahead of the pinned clock. The unrecorded one was due and was not
    // cancelled, so it bills like the recorded two; the one ahead does not.
    const invoice = invoiceFor([
      club({
        id: "a",
        name: "Klubi A",
        dates: ["2026-05-04", "2026-05-11"],
      }),
    ]);

    expect(invoice.rows[0].sessions).toBe(3);
    expect(invoice.rows[0].netCents).toBe(19_500);
  });

  it("bills a club that recorded nothing for every date it was due", () => {
    const invoice = invoiceFor([
      club({ id: "a", name: "Klubi A", dates: [] }),
    ]);

    expect(invoice.rows[0].sessions).toBe(3);
    expect(invoice.netCents).toBe(19_500);
  });

  it("bills nothing for a cancelled session", () => {
    // The ledger shows a cancelled date at €0; the file must not carry it in a
    // row's count or its money. The 18th, due and not cancelled, still bills.
    const invoice = invoiceFor([
      club({
        id: "a",
        name: "Klubi A",
        dates: ["2026-05-04"],
        cancelled: ["2026-05-11"],
      }),
    ]);

    expect(invoice.rows[0].sessions).toBe(2);
    expect(invoice.netCents).toBe(13_000);
  });

  it("leaves a club with nothing billed off the invoice entirely", () => {
    // A row worth €0.00 invites the buyer to ask what it is. A club whose every
    // due date was cancelled bills nothing and is simply not on the invoice.
    const invoice = invoiceFor([
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B", dates: [], cancelled: ALL_DUE_MONDAYS }),
    ]);

    expect(invoice.rows.map((row) => row.clubId)).toEqual(["a"]);
    expect(invoice.rows.map((row) => row.rowNumber)).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// What a row says
// ---------------------------------------------------------------------------

describe("a row's free text", () => {
  it("names the municipality, the hall, the club and when it meets", () => {
    const invoice = invoiceFor([club({ id: "a", name: "Peliklubi Purola" })]);

    expect(invoice.rows[0].text).toBe(
      "Espoo - Purolan koulu - Peliklubi Purola ma 14:15–15:30",
    );
  });

  it("omits the location when the club sits on the municipality itself", () => {
    // A remote club points at its municipality rather than at a hall inside
    // one, and "Oulu - Oulu - Verkkoklubi" says the same word twice to somebody
    // checking the line against their own records.
    const invoice = invoiceFor([
      club({
        id: "a",
        name: "Verkkoklubi Espoo",
        location: {
          id: ESPOO.id,
          name: "Espoo",
          name_i18n: null,
          type: "municipality",
        },
      }),
    ]);

    expect(invoice.rows[0].text).toBe("Espoo - Verkkoklubi Espoo ma 14:15–15:30");
  });

  it("joins a club's several weekly slots with commas", () => {
    const invoice = invoiceFor([
      club({
        id: "a",
        name: "Klubi A",
        slots: [
          { weekday: 0, start_time: "14:15", duration_minutes: 75 },
          { weekday: 2, start_time: "17:00", duration_minutes: 90 },
        ],
      }),
    ]);

    expect(invoice.rows[0].text).toBe(
      "Espoo - Purolan koulu - Klubi A ma 14:15–15:30, ke 17:00–18:30",
    );
  });

  it("says nothing about a schedule where the club has no slots", () => {
    const invoice = invoiceFor([club({ id: "a", name: "Klubi A", slots: [] })]);

    expect(invoice.rows[0].text).toBe("Espoo - Purolan koulu - Klubi A");
  });

  it("strips zero-width characters out of every name", () => {
    // At least one production school name carries a zero-width space. It
    // survives every round trip, is invisible in the admin UI, and would reach
    // the buyer's system as a byte their own search will not match.
    const invoice = invoiceFor([
      club({
        id: "a",
        name: "Peli​klubi Purola",
        location: {
          id: "a-location",
          name: "Purolan​ koulu",
          name_i18n: null,
          type: "site",
        },
      }),
    ]);

    expect(invoice.rows[0].text).toBe(
      "Espoo - Purolan koulu - Peliklubi Purola ma 14:15–15:30",
    );
  });

  it("names the municipality the club is in, not the one its buyer is billed under", () => {
    // The association case: one customer's rows can come from two sections of
    // the ledger, so a row takes its municipality from its own club.
    const invoice = invoiceFor([
      club({ id: "a", name: "Klubi A" }),
      club({
        id: "b",
        name: "Klubi B",
        municipality: HELSINKI_CITY,
        location: {
          id: "b-location",
          name: "Vuorenpeikon koulu",
          name_i18n: null,
          type: "site",
        },
      }),
    ]);

    expect(invoice.rows.map((row) => row.text.split(" - ")[0])).toEqual([
      "Espoo",
      "Helsinki",
    ]);
  });
});

// ---------------------------------------------------------------------------
// The free-text block
// ---------------------------------------------------------------------------

describe("the invoice free text", () => {
  it("states the billing period and what the rows count", () => {
    const invoice = invoiceFor([club({ id: "a", name: "Klubi A" })]);

    expect(invoice.freeText).toBe(
      "Laskutuskausi 5/26\nLaskurivillä kerhokerrat laskutuskaudella",
    );
  });

  it("puts the customer's own standing text above both", () => {
    const buyer = customer({
      id: "cust-with-text",
      fennoa_customer_no: "F0207",
      invoice_text: "Laskutusviite merkittävä jokaiselle riville.",
    });
    const invoice = invoiceFor(
      [club({ id: "a", name: "Klubi A", invoiceCustomer: buyer })],
      buyer.id,
    );

    expect(invoice.freeText).toBe(
      "Laskutusviite merkittävä jokaiselle riville.\nLaskutuskausi 5/26\nLaskurivillä kerhokerrat laskutuskaudella",
    );
  });

  it("normalizes Windows line endings pasted into the customer's text", () => {
    const buyer = customer({
      id: "cust-crlf",
      fennoa_customer_no: "F0209",
      invoice_text: "Sopimus 12/2025\r\nKustannuspaikka 4410",
    });
    const invoice = invoiceFor(
      [club({ id: "a", name: "Klubi A", invoiceCustomer: buyer })],
      buyer.id,
    );

    expect(invoice.freeText.includes("\r")).toBe(false);
    expect(invoice.freeText.split("\n")).toHaveLength(4);
  });

  it("strips zero-width characters out of the buyer's own fields too", () => {
    // The same invisible byte the club names carry, in the half of the file the
    // buyer is matched and addressed by: pasted into the customer form it
    // survives every round trip and reaches Fennoa as a name that matches
    // nobody and an address line a clerk cannot search for.
    const buyer = customer({
      id: "cust-zw",
      fennoa_customer_no: "F02​10",
      invoice_name: "Espoon​ kaupunki",
      street: "Virastokuja​ 1",
      city: "Es​poo",
      your_reference: "TIL-2026​-0418",
      invoice_text: "Sopimus​ 12/2025",
    });
    const invoice = invoiceFor(
      [club({ id: "a", name: "Klubi A", invoiceCustomer: buyer })],
      buyer.id,
    );

    expect(invoice.customer.fennoa_customer_no).toBe("F0210");
    expect(invoice.customer.invoice_name).toBe("Espoon kaupunki");
    expect(invoice.customer.street).toBe("Virastokuja 1");
    expect(invoice.customer.city).toBe("Espoo");
    expect(invoice.customer.your_reference).toBe("TIL-2026-0418");
    expect(invoice.freeText.startsWith("Sopimus 12/2025\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dates and the provisional number
// ---------------------------------------------------------------------------

describe("the invoice's dates and number", () => {
  it("dates the invoice to the first day after the month it bills", () => {
    const invoice = invoiceFor([club({ id: "a", name: "Klubi A" })]);

    expect(invoice.invoiceDate).toBe("20260601");
    expect(invoice.dueDate).toBe("20260615");
  });

  it("numbers a file by the month and the customer's Fennoa number", () => {
    // Numeric and above 100, which is Fennoa's own rule for an imported
    // identifier, and the same answer every time the month is exported —
    // Fennoa replaces it with the real invoice number when the invoice is sent.
    const second = customer({ id: "cust-b", fennoa_customer_no: "F0999" });
    const clubs = [
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B", invoiceCustomer: second }),
    ];

    expect(invoiceFor(clubs).invoiceNumber).toBe("2026050204");
    expect(invoiceFor(clubs, second.id).invoiceNumber).toBe("2026050999");
    expect(Number(invoiceFor(clubs).invoiceNumber)).toBeGreaterThan(100);
  });

  it("keeps a customer's number across a change to the rest of the month", () => {
    // The property the derivation exists for: a re-export has to carry the same
    // number as the export it replaces. Linking one more club to a new buyer
    // moves every later customer's place in the month, so a number derived from
    // that place would come back different and read as a second invoice.
    const later = customer({ id: "cust-b", fennoa_customer_no: "F0999" });
    const newcomer = customer({ id: "cust-new", fennoa_customer_no: "F0001" });
    const before = [
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B", invoiceCustomer: later }),
    ];
    const after = [
      club({ id: "c", name: "Klubi C", invoiceCustomer: newcomer }),
      ...before,
    ];

    expect(invoiceFor(after, later.id).invoiceNumber).toBe(
      invoiceFor(before, later.id).invoiceNumber,
    );
  });

  it("numbers by customer number, so the reader's locale cannot change it", () => {
    // The billing names sort differently per locale; the customer numbers do
    // not. A Swedish admin exporting the same month has to get the same file.
    const first = customer({ id: "cust-a", fennoa_customer_no: "F0100" });
    const second = customer({
      id: "cust-b",
      fennoa_customer_no: "F0200",
      invoice_name: "Aaaa kaupunki",
    });
    const clubs = [
      club({ id: "a", name: "Klubi A", invoiceCustomer: second }),
      club({ id: "b", name: "Klubi B", invoiceCustomer: first }),
    ];

    expect(invoiceFor(clubs, first.id).invoiceNumber).toBe("2026050100");
    expect(invoiceFor(clubs, second.id).invoiceNumber).toBe("2026050200");
  });

  it("falls back to the customer's place where the number has no digits", () => {
    // Not a shape Fennoa issues, but the column is free text and the number
    // still has to be numeric: the month plus the customer's 1-based position,
    // padded to four.
    const wordy = customer({ id: "cust-wordy", fennoa_customer_no: "ESPOO" });
    const invoice = invoiceFor(
      [club({ id: "a", name: "Klubi A", invoiceCustomer: wordy })],
      wordy.id,
    );

    expect(invoice.invoiceNumber).toBe("2026050001");
    expect(Number(invoice.invoiceNumber)).toBeGreaterThan(100);
  });
});

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

describe("what refuses a file", () => {
  it("refuses a customer no club in the month is billed to", () => {
    const result = buildFor([club({ id: "a", name: "Klubi A" })], "cust-nobody");

    expect(result).toEqual({ ok: false, reason: "unknown_customer" });
  });

  it("refuses the whole file when a club that RAN has no fee", () => {
    // Dropping the club would produce a file that is short by however much that
    // club was worth, with nothing in it saying so. Refusing sends the CFO to
    // the club's own page, which is where the gap is repaired.
    const result = buildFor([
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B", feeCents: null }),
      club({ id: "c", name: "Klubi C", feeCents: null }),
    ]);

    // The count is of the clubs that ran without a price, because that is what
    // the ledger's line and the route's refusal both say out loud.
    expect(result).toMatchObject({
      ok: false,
      reason: "club_without_fee",
      clubsWithoutFee: 2,
      monthStart: MONTH,
    });
  });

  it("refuses the file when a fee-less club's only billed sessions are unrecorded", () => {
    // Nobody wrote anything up, but the club was due on three Mondays and none
    // was cancelled, so it bills them — and with no price the file would be
    // short by exactly those.
    const result = buildFor([
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B", feeCents: null, dates: [] }),
    ]);

    expect(result).toMatchObject({
      ok: false,
      reason: "club_without_fee",
      clubsWithoutFee: 1,
    });
  });

  it("produces the file where the only fee-less club billed nothing", () => {
    // A club with nothing billed is on no invoice, so its missing price cannot
    // make one short — the file is about what ran. The gap is still an admin
    // error, and it is still reported where data problems are reported: on the
    // club's own line in the ledger and on the admin dashboard. Refusing the
    // file for it would be a third alarm, and one that stops the month's real
    // clubs being invoiced.
    const invoice = invoiceFor([
      club({ id: "a", name: "Klubi A", slots: [] }),
      club({
        id: "b",
        name: "Klubi B",
        feeCents: null,
        dates: [],
        cancelled: ALL_DUE_MONDAYS,
      }),
    ]);

    expect(invoice.rows.map((row) => row.clubId)).toEqual(["a"]);
    expect(invoice.netCents).toBe(6_500);
  });

  it("refuses a customer whose clubs have only cancelled sessions", () => {
    // A month of cancellations is a month with nothing to invoice, and a club
    // with no fee that was only cancelled never ran, so it does not change the
    // reason. Every due Monday is cancelled: one left standing would bill.
    const result = buildFor([
      club({ id: "a", name: "Klubi A", dates: [], cancelled: ALL_DUE_MONDAYS }),
      club({
        id: "b",
        name: "Klubi B",
        feeCents: null,
        dates: [],
        cancelled: ALL_DUE_MONDAYS,
      }),
    ]);

    expect(result).toMatchObject({ ok: false, reason: "nothing_to_invoice" });
  });

  it("answers the same question the page's control asks", () => {
    // One predicate, two readers: a disabled control that says a file cannot be
    // produced and a route that then produces one would be the worst outcome
    // available.
    const clubs = [
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B", feeCents: null }),
    ];
    const view = buildMunicipalityInvoicing({
      snapshot: snapshotOf(clubs),
      locale: "fi",
      now: NOW,
    });

    expect(view.customers).toHaveLength(1);
    const state = finvoiceFileState({
      monthStart: MONTH,
      cadence: "monthly",
      months: customerMonths([view], ESPOO_CUSTOMER.id),
    });
    expect(state).toMatchObject({ ok: false, reason: "club_without_fee" });
    expect(buildFor(clubs)).toMatchObject({
      ok: false,
      reason: "club_without_fee",
    });
  });

  it("does not count a club with no buyer as a customer of its own", () => {
    const view = buildMunicipalityInvoicing({
      snapshot: snapshotOf([
        club({ id: "a", name: "Klubi A" }),
        club({ id: "b", name: "Klubi B", invoiceCustomer: null }),
      ]),
      locale: "fi",
      now: NOW,
    });

    expect(view.customers).toHaveLength(1);
    expect(view.customers[0].clubCount).toBe(1);
    expect(view.clubsWithoutCustomer).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/**
 * The whole file for one club's month, written out.
 *
 * Asserted in full rather than element by element because the thing being
 * protected is the *shape* — an import that was verified against Fennoa three
 * times — and an assertion that checked only the values would pass a file with
 * an element missing.
 */
const EXPECTED_DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<Finvoice Version="3.0">
  <MessageTransmissionDetails>
    <MessageSenderDetails><FromIdentifier>003731104611</FromIdentifier><FromIntermediator>003721291126</FromIntermediator></MessageSenderDetails>
    <MessageReceiverDetails><ToIdentifier></ToIdentifier><ToIntermediator></ToIntermediator></MessageReceiverDetails>
    <MessageDetails><MessageIdentifier>2026050204</MessageIdentifier><MessageTimeStamp>2026-06-03T09:12:34</MessageTimeStamp></MessageDetails>
  </MessageTransmissionDetails>
  <SellerPartyDetails>
    <SellerPartyIdentifier>3110461-1</SellerPartyIdentifier>
    <SellerOrganisationName>School of Gaming Galactic Oy</SellerOrganisationName>
    <SellerPostalAddressDetails><SellerStreetName>Isokatu 56</SellerStreetName><SellerTownName>OULU</SellerTownName><SellerPostCodeIdentifier>90100</SellerPostCodeIdentifier><CountryCode>FI</CountryCode></SellerPostalAddressDetails>
  </SellerPartyDetails>
  <SellerInformationDetails>
    <SellerAccountDetails><SellerAccountID IdentificationSchemeName="IBAN">FI6717453000236887</SellerAccountID><SellerBic IdentificationSchemeName="BIC">NDEAFIHH</SellerBic></SellerAccountDetails>
    <SellerVatRegistrationText>FI31104611</SellerVatRegistrationText>
  </SellerInformationDetails>
  <BuyerPartyDetails>
    <BuyerPartyIdentifier>F0204</BuyerPartyIdentifier>
    <BuyerOrganisationName>Espoon kaupunki</BuyerOrganisationName>
    <BuyerPostalAddressDetails><BuyerStreetName>Virastokuja 1</BuyerStreetName><BuyerTownName>Espoo</BuyerTownName><BuyerPostCodeIdentifier>02070</BuyerPostCodeIdentifier><CountryCode>FI</CountryCode></BuyerPostalAddressDetails>
  </BuyerPartyDetails>
  <DeliveryDetails><DeliveryMethodText>Electronic invoice</DeliveryMethodText></DeliveryDetails>
  <InvoiceDetails>
    <InvoiceTypeCode>INV01</InvoiceTypeCode><InvoiceTypeText>LASKU</InvoiceTypeText><OriginCode>Original</OriginCode>
    <InvoiceNumber>2026050204</InvoiceNumber>
    <InvoiceDate Format="CCYYMMDD">20260601</InvoiceDate>
    <InvoiceTotalVatExcludedAmount AmountCurrencyIdentifier="EUR">130.00</InvoiceTotalVatExcludedAmount>
    <InvoiceTotalVatAmount AmountCurrencyIdentifier="EUR">33.15</InvoiceTotalVatAmount>
    <InvoiceTotalVatIncludedAmount AmountCurrencyIdentifier="EUR">163.15</InvoiceTotalVatIncludedAmount>
    <PaymentTermsDetails><InvoiceDueDate Format="CCYYMMDD">20260615</InvoiceDueDate><PaymentOverDueFineDetails><PaymentOverDueFineFreeText>7.50 %</PaymentOverDueFineFreeText></PaymentOverDueFineDetails></PaymentTermsDetails>
    <InvoiceFreeText>Laskutuskausi 5/26
Laskurivillä kerhokerrat laskutuskaudella</InvoiceFreeText>
    <SellerReferenceIdentifier>Mikko Perälä</SellerReferenceIdentifier>
    <BuyerReferenceIdentifier>TIL-2026-0418</BuyerReferenceIdentifier>
  </InvoiceDetails>
  <VatSpecificationDetails><VatBaseAmount AmountCurrencyIdentifier="EUR">130.00</VatBaseAmount><VatRatePercent>25.50</VatRatePercent><VatRateAmount AmountCurrencyIdentifier="EUR">33.15</VatRateAmount></VatSpecificationDetails>
  <InvoiceRow>
    <RowNumber>1</RowNumber><ArticleIdentifier>2100</ArticleIdentifier><ArticleName>Nuorisotyö</ArticleName>
    <DeliveredQuantity QuantityUnitCode="krt">2.00</DeliveredQuantity>
    <UnitPriceAmount AmountCurrencyIdentifier="EUR">65.00</UnitPriceAmount>
    <RowVatRatePercent>25.50</RowVatRatePercent>
    <RowVatAmount AmountCurrencyIdentifier="EUR">33.15</RowVatAmount>
    <RowVatExcludedAmount AmountCurrencyIdentifier="EUR">130.00</RowVatExcludedAmount>
    <RowAmount AmountCurrencyIdentifier="EUR">163.15</RowAmount>
    <RowFreeText>Espoo - Purolan koulu - Peliklubi Purola ma 14:15–15:30</RowFreeText>
    <RowIdentifier>25000</RowIdentifier><RowAccountDimensionText>25000</RowAccountDimensionText>
  </InvoiceRow>
</Finvoice>`;

describe("the Finvoice document", () => {
  // Two Mondays written up and the third cancelled, so the row bills two.
  const oneClub = invoiceFor([
    club({
      id: "a",
      name: "Peliklubi Purola",
      dates: ["2026-05-04", "2026-05-11"],
      cancelled: ["2026-05-18"],
    }),
  ]);

  it("writes the structure Fennoa's import was verified against", () => {
    expect(serializeFinvoice(oneClub, GENERATED_AT)).toBe(EXPECTED_DOCUMENT);
  });

  it("starts with the declaration and no byte-order mark", () => {
    // A BOM reaches Fennoa as stray bytes before the declaration and the file
    // is refused outright.
    const xml = serializeFinvoice(oneClub, GENERATED_AT);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml.charCodeAt(0)).toBe("<".charCodeAt(0));
  });

  it("stamps the generation time in Helsinki, not in UTC", () => {
    // A wall clock with no zone on it is read as the writer's own, and the
    // writer is a Finnish company. Late enough in the evening that the two
    // answers fall on different days.
    const lateEvening = new Date("2026-06-03T00:30:00+03:00");
    const xml = serializeFinvoice(oneClub, lateEvening);

    expect(xml).toContain("<MessageTimeStamp>2026-06-03T00:30:00</MessageTimeStamp>");
  });

  it("escapes an ampersand in a name rather than shipping something that is not XML", () => {
    const buyer = customer({
      id: "cust-amp",
      fennoa_customer_no: "F0300",
      invoice_name: "Kasvatus & opetus",
    });
    const invoice = invoiceFor(
      [
        club({
          id: "a",
          name: "Peli & Puuha",
          invoiceCustomer: buyer,
          location: {
            id: "a-location",
            name: "Koulu <A>",
            name_i18n: null,
            type: "site",
          },
        }),
      ],
      buyer.id,
    );
    const xml = serializeFinvoice(invoice, GENERATED_AT);

    expect(xml).toContain(
      "<BuyerOrganisationName>Kasvatus &amp; opetus</BuyerOrganisationName>",
    );
    expect(xml).toContain(
      "<RowFreeText>Espoo - Koulu &lt;A&gt; - Peli &amp; Puuha ma 14:15–15:30</RowFreeText>",
    );
    // Nothing raw survives: every remaining `&` opens a real entity.
    expect(xml.match(/&(?!(amp|lt|gt|quot|apos);)/g)).toBeNull();
  });

  it("writes an empty buyer reference where the customer has none", () => {
    const buyer = customer({ id: "cust-noref", fennoa_customer_no: "F0400" });
    const invoice = invoiceFor(
      [club({ id: "a", name: "Klubi A", invoiceCustomer: buyer })],
      buyer.id,
    );

    expect(serializeFinvoice(invoice, GENERATED_AT)).toContain(
      "<BuyerReferenceIdentifier></BuyerReferenceIdentifier>",
    );
  });

  it("writes one row per club, numbered from one", () => {
    const invoice = invoiceFor([
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B" }),
      club({ id: "c", name: "Klubi C" }),
    ]);
    const xml = serializeFinvoice(invoice, GENERATED_AT);

    expect(xml.match(/<InvoiceRow>/g)).toHaveLength(3);
    expect(xml.match(/<RowNumber>\d+<\/RowNumber>/g)).toEqual([
      "<RowNumber>1</RowNumber>",
      "<RowNumber>2</RowNumber>",
      "<RowNumber>3</RowNumber>",
    ]);
  });

  it("keeps the free text's newlines inside the one element", () => {
    const buyer = customer({
      id: "cust-text",
      fennoa_customer_no: "F0500",
      invoice_text: "Sopimus 12/2025",
    });
    const invoice = invoiceFor(
      [club({ id: "a", name: "Klubi A", invoiceCustomer: buyer })],
      buyer.id,
    );

    expect(serializeFinvoice(invoice, GENERATED_AT)).toContain(
      "<InvoiceFreeText>Sopimus 12/2025\nLaskutuskausi 5/26\nLaskurivillä kerhokerrat laskutuskaudella</InvoiceFreeText>",
    );
  });
});

// ---------------------------------------------------------------------------
// Where the file is fetched from, and what it is called
// ---------------------------------------------------------------------------

describe("the download's path and filename", () => {
  it("asks the export route for one month and one customer", () => {
    expect(finvoiceHref(MONTH, "cust-espoo")).toBe(
      "/api/admin/municipality-invoicing/finvoice?month=2026-05&customer=cust-espoo",
    );
  });

  it("names the file by month first, so a download folder sorts by month", () => {
    expect(finvoiceFileName(MONTH, "F0204")).toBe("invoice_202605_F0204.xml");
  });

  it("reduces a customer number to characters a header can carry", () => {
    // The column is free text, and a quote or a semicolon in a
    // `Content-Disposition` filename is a header a browser may read as two
    // parameters.
    expect(finvoiceFileName(MONTH, 'F02"04; x')).toBe(
      "invoice_202605_F02_04__x.xml",
    );
  });
});

// ---------------------------------------------------------------------------
// A quarterly or half-yearly customer's period
// ---------------------------------------------------------------------------

/**
 * A customer invoiced once a quarter or once a half-year: one file per period,
 * produced in the period's last month and covering every month of it.
 *
 * Its clubs meet on Mondays from 12 January. The first quarter's Mondays are
 * three in January (12, 19, 26), four in February (2–23) and five in March
 * (2–30) — twelve in all, every one passed by the pinned clock and none
 * recorded or cancelled, so every one bills.
 */
describe("a period customer's file", () => {
  const QUARTERLY = customer({
    id: "cust-quarterly",
    fennoa_customer_no: "F0221",
    invoice_name: "Turun kaupunki",
    billing_cadence: "quarterly",
  });
  const HALF_YEARLY = customer({
    id: "cust-half",
    fennoa_customer_no: "F0224",
    invoice_name: "Oulun kaupunki",
    billing_cadence: "half_yearly",
  });

  /** One month's document holding the clubs given. */
  function monthOf(
    month: string,
    clubs: MunicipalityInvoicingClub[],
  ): MunicipalityInvoicingSnapshot {
    return { month_start: month, clubs };
  }

  /** A Monday club of `buyer`'s that recorded nothing — it bills every date it was due. */
  function mondayClub(
    buyer: InvoiceCustomerRow,
    overrides: Partial<ClubSpec> = {},
  ): MunicipalityInvoicingClub {
    return club({
      id: `${buyer.id}-club`,
      name: "Peliklubi Runosmäenranta",
      invoiceCustomer: buyer,
      dates: [],
      ...overrides,
    });
  }

  const Q1 = ["2026-01-01", "2026-02-01", "2026-03-01"];

  function q1Snapshots(
    extra: (month: string) => MunicipalityInvoicingClub[] = () => [],
  ): MunicipalityInvoicingSnapshot[] {
    return Q1.map((month) =>
      monthOf(month, [mondayClub(QUARTERLY), ...extra(month)]),
    );
  }

  function quarterFor(
    snapshots: MunicipalityInvoicingSnapshot[],
    monthStart = "2026-03-01",
    now = NOW,
  ) {
    return buildFinvoiceForPeriod({
      monthStart,
      snapshots,
      customerId: QUARTERLY.id,
      now,
    });
  }

  function quarterInvoice(
    snapshots: MunicipalityInvoicingSnapshot[] = q1Snapshots(),
  ): FinvoiceInvoice {
    const result = quarterFor(snapshots);
    if (!result.ok) {
      throw new Error(`expected an invoice, got a refusal: ${result.reason}`);
    }
    return result.invoice;
  }

  it("bills the whole quarter, a row per club per month", () => {
    const invoice = quarterInvoice();

    expect(
      invoice.rows.map((row) => [row.monthStart, row.monthEnd, row.sessions]),
    ).toEqual([
      ["2026-01-01", "2026-01-31", 3],
      ["2026-02-01", "2026-02-28", 4],
      ["2026-03-01", "2026-03-31", 5],
    ]);
    expect(invoice.rows.map((row) => row.rowNumber)).toEqual([1, 2, 3]);
    // Three rows of one club: the month is what tells them apart to a clerk.
    expect(invoice.rows.map((row) => row.text)).toEqual([
      "Espoo - Purolan koulu - Peliklubi Runosmäenranta ma 14:15–15:30 (1/26)",
      "Espoo - Purolan koulu - Peliklubi Runosmäenranta ma 14:15–15:30 (2/26)",
      "Espoo - Purolan koulu - Peliklubi Runosmäenranta ma 14:15–15:30 (3/26)",
    ]);
    // Twelve Mondays at €65.00, and the totals are the sums of the rows.
    expect(invoice.netCents).toBe(12 * 6_500);
    expect(invoice.vatCents).toBe(
      invoice.rows.reduce((sum, row) => sum + row.vatCents, 0),
    );
    expect(invoice.grossCents).toBe(invoice.netCents + invoice.vatCents);
  });

  it("numbers, dates and names the quarter from its last month", () => {
    const invoice = quarterInvoice();

    expect(invoice.monthStart).toBe("2026-03-01");
    expect(invoice.invoiceNumber).toBe("2026030221");
    expect(invoice.invoiceDate).toBe("20260401");
    expect(invoice.dueDate).toBe("20260415");
    expect(invoice.freeText).toBe(
      "Laskutuskausi 1–3/26\nLaskurivillä kerhokerrat laskutuskaudella",
    );
    expect(
      finvoiceFileName(invoice.monthStart, invoice.customer.fennoa_customer_no),
    ).toBe("invoice_202603_F0221.xml");
  });

  it("keeps the quarter's number when the rest of the period changes", () => {
    // Another buyer appearing in February moves every position in that month's
    // list; the number is the customer's own and does not move with it.
    const before = quarterInvoice();
    const after = quarterInvoice(
      q1Snapshots((month) =>
        month === "2026-02-01"
          ? [
              club({
                id: "newcomer",
                name: "Klubi Uusi",
                dates: [],
                invoiceCustomer: customer({
                  id: "cust-aaa",
                  fennoa_customer_no: "F0001",
                }),
              }),
            ]
          : [],
      ),
    );

    expect(after.invoiceNumber).toBe(before.invoiceNumber);
  });

  it("refuses a month in the middle of the quarter", () => {
    // February ends no quarter: the quarter's file is March's, and nowhere else.
    const result = quarterFor(q1Snapshots().slice(0, 2), "2026-02-01");

    expect(result).toMatchObject({
      ok: false,
      reason: "not_period_end",
      period: { lastMonth: "2026-03-01" },
    });
  });

  it("refuses the quarter over a club that ran with no fee in January, and names January", () => {
    // The club's term ended in January, so March's ledger does not show it —
    // which is exactly why the refusal names the month the problem is in.
    const result = quarterFor(
      q1Snapshots((month) =>
        month === "2026-01-01"
          ? [
              mondayClub(QUARTERLY, {
                id: "winter-club",
                name: "Peliklubi Salpausrinne",
                feeCents: null,
                endDate: "2026-01-31",
              }),
            ]
          : [],
      ),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "club_without_fee",
      monthStart: "2026-01-01",
      clubsWithoutFee: 1,
    });
  });

  it("answers in the page exactly what the route answers", () => {
    // One predicate, two readers, over the whole period: the page builds the
    // same months and asks the same question of them.
    const snapshots = q1Snapshots();
    const views = snapshots.map((snapshot) =>
      buildMunicipalityInvoicing({ snapshot, locale: "en", now: NOW }),
    );
    const files = customerFilesForMonth({ monthStart: "2026-03-01", views });
    const state = files.byCustomerId.get(QUARTERLY.id)?.state;

    expect(state).toMatchObject({ ok: true, billedCount: 12 });
    expect(state?.ok && state.netCents).toBe(quarterInvoice().netCents);
  });

  it("labels a month in the middle of the period rather than offering a file", () => {
    const views = q1Snapshots()
      .slice(0, 2)
      .map((snapshot) =>
        buildMunicipalityInvoicing({ snapshot, locale: "en", now: NOW }),
      );
    const files = customerFilesForMonth({ monthStart: "2026-02-01", views });

    expect(files.byCustomerId.get(QUARTERLY.id)?.state).toMatchObject({
      ok: false,
      reason: "not_period_end",
      period: { lastMonth: "2026-03-01" },
    });
  });

  it("waits for the period's earlier months rather than deciding over part of it", () => {
    const march = buildMunicipalityInvoicing({
      snapshot: q1Snapshots()[2],
      locale: "en",
      now: NOW,
    });
    const files = customerFilesForMonth({
      monthStart: "2026-03-01",
      views: [march],
    });

    expect(files.byCustomerId.get(QUARTERLY.id)?.state).toMatchObject({
      ok: false,
      reason: "period_not_read",
    });
    // And the builder refuses to write a file over part of a period at all.
    expect(() =>
      buildFinvoiceInvoice({
        monthStart: "2026-03-01",
        views: [march],
        customerId: QUARTERLY.id,
      }),
    ).toThrow(/not read whole/);
  });

  it("produces the quarter in a month the customer has no club in", () => {
    // The spring term ends in May, and the second quarter ends in June: the
    // buyer owes April and May, and June's ledger has none of its clubs.
    const july = new Date("2026-07-02T10:00:00+03:00");
    const snapshots = [
      monthOf("2026-04-01", [mondayClub(QUARTERLY)]),
      monthOf("2026-05-01", [mondayClub(QUARTERLY)]),
      monthOf("2026-06-01", []),
    ];
    const views = snapshots.map((snapshot) =>
      buildMunicipalityInvoicing({ snapshot, locale: "en", now: july }),
    );

    const files = customerFilesForMonth({ monthStart: "2026-06-01", views });
    expect(files.byCustomerId.has(QUARTERLY.id)).toBe(false);
    expect(files.withoutClubThisMonth.map((file) => file.customer.id)).toEqual(
      [QUARTERLY.id],
    );
    expect(files.withoutClubThisMonth[0].state).toMatchObject({ ok: true });

    const result = quarterFor(snapshots, "2026-06-01", july);
    if (!result.ok) throw new Error(result.reason);
    // April's four Mondays and May's four; June bills nothing.
    expect(result.invoice.rows.map((row) => row.sessions)).toEqual([4, 4]);
    expect(result.invoice.invoiceNumber).toBe("2026060221");
  });

  it("bills a half-year over six months, and calls March the middle of it", () => {
    const july = new Date("2026-07-02T10:00:00+03:00");
    const months = [
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ];
    const snapshots = months.map((month) =>
      monthOf(month, month === "2026-06-01" ? [] : [mondayClub(HALF_YEARLY)]),
    );

    const march = buildFinvoiceForPeriod({
      monthStart: "2026-03-01",
      snapshots: snapshots.slice(0, 3),
      customerId: HALF_YEARLY.id,
      now: july,
    });
    expect(march).toMatchObject({
      ok: false,
      reason: "not_period_end",
      period: { lastMonth: "2026-06-01" },
    });

    const june = buildFinvoiceForPeriod({
      monthStart: "2026-06-01",
      snapshots,
      customerId: HALF_YEARLY.id,
      now: july,
    });
    if (!june.ok) throw new Error(june.reason);
    // 3 + 4 + 5 + 4 + 4 Mondays, January to May.
    expect(june.invoice.rows.map((row) => row.sessions)).toEqual([
      3, 4, 5, 4, 4,
    ]);
    expect(june.invoice.freeText).toContain("Laskutuskausi 1–6/26");
  });

  it("states the period on the invoice and each row's month, where it covers several", () => {
    const xml = serializeFinvoice(quarterInvoice(), GENERATED_AT);

    expect(xml).toContain(
      '</InvoiceDate>\n    <InvoicingPeriodStartDate Format="CCYYMMDD">20260101</InvoicingPeriodStartDate><InvoicingPeriodEndDate Format="CCYYMMDD">20260331</InvoicingPeriodEndDate>\n    <InvoiceTotalVatExcludedAmount',
    );
    expect(xml.match(/<StartDate Format="CCYYMMDD">\d+<\/StartDate>/g)).toEqual([
      '<StartDate Format="CCYYMMDD">20260101</StartDate>',
      '<StartDate Format="CCYYMMDD">20260201</StartDate>',
      '<StartDate Format="CCYYMMDD">20260301</StartDate>',
    ]);
    expect(xml).toContain(
      '<DeliveredQuantity QuantityUnitCode="krt">3.00</DeliveredQuantity>\n    <StartDate Format="CCYYMMDD">20260101</StartDate><EndDate Format="CCYYMMDD">20260131</EndDate>\n    <UnitPriceAmount',
    );
  });

  it("leaves a monthly file without the period elements it was verified without", () => {
    const xml = serializeFinvoice(
      invoiceFor([club({ id: "a", name: "Klubi A" })]),
      GENERATED_AT,
    );

    expect(xml).not.toContain("InvoicingPeriod");
    expect(xml).not.toContain("<StartDate");
  });
});
