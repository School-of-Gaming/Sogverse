import { describe, it, expect } from "vitest";
import {
  buildFinvoiceForMonth,
  finvoiceFileName,
  finvoiceHref,
  finvoiceReadiness,
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
 * so a month's Mondays fall either side of "today" and a club's recorded count
 * is a real answer rather than every date it was scheduled for.
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
  /** Monday 14:15 for 75 minutes unless a case wants something else. */
  slots?: MunicipalityInvoicingClub["schedule_slots"];
  /** Dates with a stored row. Mondays in May 2026 are 4, 11, 18 and 25. */
  dates?: readonly string[];
}

function club(spec: ClubSpec): MunicipalityInvoicingClub {
  return {
    id: spec.id,
    timezone: HELSINKI,
    start_date: "2026-01-12",
    end_date: "2026-05-29",
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
  };
}

function snapshotOf(clubs: MunicipalityInvoicingClub[]): MunicipalityInvoicingSnapshot {
  return { month_start: MONTH, clubs };
}

function buildFor(
  clubs: MunicipalityInvoicingClub[],
  customerId: string = ESPOO_CUSTOMER.id,
) {
  return buildFinvoiceForMonth({
    snapshot: snapshotOf(clubs),
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

// ---------------------------------------------------------------------------
// The money
// ---------------------------------------------------------------------------

describe("the money rule", () => {
  it("rounds one row's VAT half up at the standard Finnish rate", () => {
    // 65.00 at 25.5 % is 16.575, which is the awkward half-cent the whole rule
    // exists for. Half up is 16.58.
    const invoice = invoiceFor([club({ id: "a", name: "Peliklubi Purola" })]);

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
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B" }),
      club({ id: "c", name: "Klubi C" }),
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

  it("counts only the sessions that ran, not the ones that were scheduled", () => {
    // Four Mondays in May, two of them written up, one missed and one still
    // ahead of the pinned clock. The invoice bills two.
    const invoice = invoiceFor([
      club({
        id: "a",
        name: "Klubi A",
        dates: ["2026-05-04", "2026-05-11"],
      }),
    ]);

    expect(invoice.rows[0].sessions).toBe(2);
    expect(invoice.rows[0].netCents).toBe(13_000);
  });

  it("leaves a club that recorded nothing off the invoice entirely", () => {
    // A row worth €0.00 invites the buyer to ask what it is. A club that did
    // not run this month is simply not on the invoice.
    const invoice = invoiceFor([
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B", dates: [] }),
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

  it("numbers a file by the month and the customer's place in it", () => {
    // Numeric and above 100, which is Fennoa's own rule for an imported
    // identifier, and the same answer every time the month is exported —
    // Fennoa replaces it with the real invoice number when the invoice is sent.
    const second = customer({ id: "cust-b", fennoa_customer_no: "F0999" });
    const clubs = [
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B", invoiceCustomer: second }),
    ];

    expect(invoiceFor(clubs).invoiceNumber).toBe("20260501");
    expect(invoiceFor(clubs, second.id).invoiceNumber).toBe("20260502");
    expect(Number(invoiceFor(clubs).invoiceNumber)).toBeGreaterThan(100);
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

    expect(invoiceFor(clubs, first.id).invoiceNumber).toBe("20260501");
    expect(invoiceFor(clubs, second.id).invoiceNumber).toBe("20260502");
  });
});

// ---------------------------------------------------------------------------
// The refusals
// ---------------------------------------------------------------------------

describe("what refuses a file", () => {
  it("refuses a customer no club in the month is billed to", () => {
    const result = buildFor([club({ id: "a", name: "Klubi A" })], "cust-nobody");

    expect(result).toEqual({
      ok: false,
      reason: "unknown_customer",
      clubsWithoutFee: 0,
    });
  });

  it("refuses the whole file when any of the customer's clubs has no fee", () => {
    // Dropping the club would produce a file that is short by however much that
    // club was worth, with nothing in it saying so. Refusing sends the CFO to
    // the club's own page, which is where the gap is repaired.
    const result = buildFor([
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B", feeCents: null }),
    ]);

    expect(result).toEqual({
      ok: false,
      reason: "club_without_fee",
      clubsWithoutFee: 1,
    });
  });

  it("refuses on a missing fee even where that club recorded nothing", () => {
    // The club would not have been a row anyway, and the refusal is still
    // right: the page counts it as a club with no fee, so a download that
    // succeeded here would contradict the warning printed beside it.
    const result = buildFor([
      club({ id: "a", name: "Klubi A" }),
      club({ id: "b", name: "Klubi B", feeCents: null, dates: [] }),
    ]);

    expect(result.ok).toBe(false);
  });

  it("refuses a customer whose clubs all recorded nothing", () => {
    const result = buildFor([club({ id: "a", name: "Klubi A", dates: [] })]);

    expect(result).toEqual({
      ok: false,
      reason: "nothing_to_invoice",
      clubsWithoutFee: 0,
    });
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
    const readiness = finvoiceReadiness(view.customers[0]);
    expect(readiness.ok).toBe(false);
    expect(buildFor(clubs).ok).toBe(false);
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
    <MessageDetails><MessageIdentifier>20260501</MessageIdentifier><MessageTimeStamp>2026-06-03T09:12:34</MessageTimeStamp></MessageDetails>
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
    <InvoiceNumber>20260501</InvoiceNumber>
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
  const oneClub = invoiceFor([
    club({
      id: "a",
      name: "Peliklubi Purola",
      dates: ["2026-05-04", "2026-05-11"],
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
