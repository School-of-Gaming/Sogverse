import { describe, it, expect } from "vitest";
import { createTranslator } from "use-intl/core";
import en from "../../../messages/en.json";
import fi from "../../../messages/fi.json";
import fr from "../../../messages/fr.json";
import {
  buildGeduInvoicing,
  type GeduInvoice,
} from "@/components/gedu-invoicing/build-gedu-invoicing";
import {
  buildGeduInvoiceCsv,
  csvField,
  csvMoney,
  csvText,
} from "@/components/gedu-invoicing/gedu-invoice-csv";
import type { GeduInvoicingTranslator } from "@/components/gedu-invoicing/gedu-invoice-export";
import {
  geduInvoicePdfContent,
  pdfText,
  renderGeduInvoicePdf,
} from "@/components/gedu-invoicing/gedu-invoice-pdf";
import {
  GEDU_INVOICING_NOW,
  GEDU_INVOICING_WORKING_MONTH,
  MY_GEDU_INVOICING_VIEWERS,
  geduInvoicingMonthFixture,
} from "@/components/gedu-invoicing/mock-gedu-invoicing-fixtures";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { Messages } from "@/i18n/messages";

const CATALOGS: Partial<Record<SupportedLocale, Messages>> = { en, fi, fr };

function translator(locale: SupportedLocale): GeduInvoicingTranslator {
  const messages = CATALOGS[locale];
  if (messages === undefined) throw new Error(`no catalog for ${locale}`);
  return createTranslator({ locale, messages, namespace: "geduInvoicing" });
}

/** One gedu's own month, read the way the gedu's page reads it. */
function invoiceOf(viewer: "was-away" | "stood-in"): GeduInvoice {
  const view = buildGeduInvoicing({
    snapshot: geduInvoicingMonthFixture(
      GEDU_INVOICING_WORKING_MONTH,
      MY_GEDU_INVOICING_VIEWERS[viewer],
    ),
    locale: "en",
    now: GEDU_INVOICING_NOW,
  });
  const gedu = view.gedus.at(0);
  if (gedu === undefined) throw new Error(`fixture has no ${viewer} gedu`);
  return gedu;
}

/** The CSV's records as fields, BOM stripped. The fixtures need no quoting. */
function records(csv: string): string[][] {
  return csv
    .replace(/^\uFEFF/, "")
    .split("\r\n")
    .filter((line) => line !== "")
    .map((line) => line.split(";"));
}

function centsOf(field: string): number {
  const [euros, cents] = field.split(",");
  return Number(euros) * 100 + Number(cents);
}

describe("buildGeduInvoiceCsv", () => {
  const aino = invoiceOf("was-away");
  const mikael = invoiceOf("stood-in");

  it("is UTF-8 with a BOM, semicolon-delimited, with CRLF line ends", () => {
    const csv = buildGeduInvoiceCsv({ invoice: aino, locale: "en", t: translator("en") });

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.replaceAll("\r\n", "")).not.toMatch(/[\r\n]/);
    expect(records(csv)[0]).toEqual([
      "Date",
      "Week",
      "Segment",
      "Club",
      "Group",
      "Location",
      "Role",
      "Status",
      "Covering for / Substitute",
      "Fee excl. VAT",
      "Amount excl. VAT",
    ]);
  });

  it("has one row per dated line of every kind, by date then club", () => {
    const rows = records(
      buildGeduInvoiceCsv({ invoice: aino, locale: "en", t: translator("en") }),
    ).slice(1);
    const lineCount = aino.clubs.reduce((n, club) => n + club.lines.length, 0);

    expect(rows).toHaveLength(lineCount);
    expect(rows.map((row) => [row[0], row[3], row[7]])).toEqual([
      ["2026-05-04", "Pelikerho Kivikko", "Recorded"],
      ["2026-05-05", "Minecraft adventurers", "Recorded"],
      ["2026-05-11", "Pelikerho Kivikko", "Away"],
      ["2026-05-12", "Minecraft adventurers", "Not recorded"],
      ["2026-05-18", "Pelikerho Kivikko", "Recorded"],
      ["2026-05-19", "Minecraft adventurers", "Recorded"],
      ["2026-05-25", "Pelikerho Kivikko", "Upcoming"],
      ["2026-05-26", "Minecraft adventurers", "Upcoming"],
    ]);
  });

  it("writes week, segment, location, role and the other gedu", () => {
    const rows = records(
      buildGeduInvoiceCsv({ invoice: aino, locale: "en", t: translator("en") }),
    ).slice(1);

    expect(rows[2]).toEqual([
      "2026-05-11",
      "20",
      "Municipality",
      "Pelikerho Kivikko",
      "Ryhmä A",
      "Kivikonrinteen koulu",
      "Primary",
      "Away",
      "Mikael Rinne",
      "65,00",
      "0,00",
    ]);
    // An online club has no location: the cell is empty, not a word.
    expect(rows[1][5]).toBe("");
    expect(rows[1][2]).toBe("Consumer");
  });

  it("sums the amount column to the invoice total, non-paying lines at 0,00", () => {
    const rows = records(
      buildGeduInvoiceCsv({ invoice: aino, locale: "en", t: translator("en") }),
    ).slice(1);

    const sum = rows.reduce((total, row) => total + centsOf(row[10]), 0);
    expect(sum).toBe(aino.totalCents);
    for (const row of rows.filter((row) => row[7] !== "Recorded")) {
      expect(row[10]).toBe("0,00");
    }
  });

  it("leaves both money cells blank where the fee is unset, and names who was covered", () => {
    const rows = records(
      buildGeduInvoiceCsv({ invoice: mikael, locale: "en", t: translator("en") }),
    ).slice(1);

    const unpriced = rows.filter((row) => row[3] === "Rakentajakerho Mäntyranta");
    expect(unpriced.length).toBeGreaterThan(0);
    for (const row of unpriced) {
      expect(row[9]).toBe("");
      expect(row[10]).toBe("");
    }
    expect(unpriced.map((row) => row[7])).toContain("Cancelled");

    const cover = rows.find((row) => row[0] === "2026-05-11");
    expect(cover?.[8]).toBe("Aino Kallio");
    expect(cover?.[7]).toBe("Recorded");
    expect(cover?.[10]).toBe("65,00");
  });

  it("words headers and values in the page locale", () => {
    const [header, first] = records(
      buildGeduInvoiceCsv({ invoice: aino, locale: "fi", t: translator("fi") }),
    );

    expect(header[0]).toBe("Päivämäärä");
    expect(header[10]).toBe("Summa (ALV 0 %)");
    expect(first[2]).toBe("Kuntalaskutus");
    expect(first[6]).toBe("Vastaava Gedu");
    expect(first[7]).toBe("Kirjattu");
  });

  it("neutralises a typed cell a spreadsheet would read as a formula", () => {
    const hostile: GeduInvoice = {
      ...aino,
      clubs: aino.clubs.map((club) => ({
        ...club,
        name: club.segment === "municipality" ? "-Kivikko" : club.name,
        lines: club.lines.map((line) => ({
          ...line,
          substitute:
            line.substitute === null
              ? null
              : { ...line.substitute, firstName: '=HYPERLINK("x","y")' },
        })),
      })),
    };
    const csv = buildGeduInvoiceCsv({ invoice: hostile, locale: "en", t: translator("en") });
    const rows = records(csv).slice(1);

    expect(rows[2][3]).toBe("'-Kivikko");
    expect(rows[2][8]).toBe(`"'=HYPERLINK(""x"",""y"") Rinne"`);
    // Generated cells are left alone, the club beside it untouched.
    expect(rows[2][0]).toBe("2026-05-11");
    expect(rows[1][3]).toBe("Minecraft adventurers");
  });
});

describe("csvText", () => {
  it("prefixes a quote to a value opening with a formula character", () => {
    for (const lead of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(csvText(`${lead}1+1`)).toBe(`'${lead}1+1`);
    }
    expect(csvText("Ryhmä A")).toBe("Ryhmä A");
    expect(csvText("A-ryhmä")).toBe("A-ryhmä");
    expect(csvText("")).toBe("");
  });
});

describe("csvMoney", () => {
  it("writes a decimal comma, two decimals, no thousands separator", () => {
    expect(csvMoney(0)).toBe("0,00");
    expect(csvMoney(5)).toBe("0,05");
    expect(csvMoney(6_500)).toBe("65,00");
    expect(csvMoney(123_456_789)).toBe("1234567,89");
  });

  it("refuses a figure that is not whole, non-negative cents", () => {
    expect(() => csvMoney(-1)).toThrow();
    expect(() => csvMoney(1.5)).toThrow();
  });
});

describe("csvField", () => {
  it("quotes a field holding a delimiter, a quote or a line break", () => {
    expect(csvField("Ryhmä A")).toBe("Ryhmä A");
    expect(csvField("A; B")).toBe('"A; B"');
    expect(csvField('The "Builders"')).toBe('"The ""Builders"""');
    expect(csvField("one\ntwo")).toBe('"one\ntwo"');
    expect(csvField("one\r\ntwo")).toBe('"one\r\ntwo"');
    // A comma is not the delimiter here and needs no quotes.
    expect(csvField("Espoo, Kivikko")).toBe("Espoo, Kivikko");
  });
});

describe("geduInvoicePdfContent", () => {
  const aino = invoiceOf("was-away");
  const mikael = invoiceOf("stood-in");

  function contentOf(invoice: GeduInvoice, locale: SupportedLocale = "en") {
    return geduInvoicePdfContent({
      invoice,
      monthStart: GEDU_INVOICING_WORKING_MONTH,
      locale,
      now: GEDU_INVOICING_NOW,
      t: translator(locale),
    });
  }

  it("heads the statement with the gedu, the month, the recipient and when", () => {
    const content = contentOf(aino);

    expect(content.title).toBe("Work statement");
    expect(content.geduName).toBe("Aino Kallio");
    expect(content.geduEmail).toBe("aino.kallio@example.com");
    expect(content.month).toBe("May 2026");
    expect(content.to).toBe("To: School of Gaming Galactic Oy");
    // 10:40 in Helsinki, whatever zone the test runs in.
    expect(content.figuresAsOf).toMatch(
      /^Figures as of May 21, 2026.*10:40.*GMT\+3$/,
    );
  });

  function without(
    invoice: GeduInvoice,
    kinds: readonly GeduInvoice["clubs"][number]["lines"][number]["kind"][],
  ): GeduInvoice {
    return {
      ...invoice,
      clubs: invoice.clubs.map((club) => ({
        ...club,
        lines: club.lines.filter((line) => !kinds.includes(line.kind)),
      })),
    };
  }

  it("says what is still open: each unrecorded session, and the upcoming count", () => {
    expect(contentOf(aino).completeness).toEqual({
      isComplete: false,
      title: "This statement is not complete",
      body: null,
      unrecorded: {
        text: expect.stringMatching(
          /^1 past session has nothing recorded, so it is not included\. Record a report, a note or attendance for it/,
        ),
        sessions: ["Tue 5/12/2026 · Minecraft adventurers · Group 1"],
      },
      upcoming:
        "2 sessions are still upcoming: the month is in progress, so these figures can change.",
    });
  });

  it("names only what is open: no unrecorded list once every past session is recorded", () => {
    const completeness = contentOf(without(aino, ["unrecorded"])).completeness;

    expect(completeness.isComplete).toBe(false);
    expect(completeness.unrecorded).toBeNull();
    expect(completeness.upcoming).toMatch(/^2 sessions are still upcoming/);
  });

  it("says the month is complete once nothing is upcoming or unrecorded", () => {
    expect(
      contentOf(without(aino, ["unrecorded", "upcoming"])).completeness,
    ).toEqual({
      isComplete: true,
      title: "This statement is complete",
      body: "No session this month is still upcoming or waiting to be recorded.",
      unrecorded: null,
      upcoming: null,
    });
  });

  it("leads with the two subtotals and their total, all excluding VAT", () => {
    expect(contentOf(aino).summary).toEqual([
      { label: "Municipality, excl. VAT", figure: "€130.00", isTotal: false },
      { label: "Consumer, excl. VAT", figure: "€100.00", isTotal: false },
      { label: "Total, excl. VAT", figure: "€230.00", isTotal: true },
    ]);
  });

  it("lists one row per club line, grouped by segment", () => {
    expect(contentOf(aino).segments).toEqual([
      {
        label: "Municipality",
        clubs: [
          {
            productId: expect.any(String),
            club: "Pelikerho Kivikko",
            role: "Primary",
            sessions: "2",
            fee: "€65.00",
            total: "€130.00",
          },
        ],
      },
      {
        label: "Consumer",
        clubs: [
          {
            productId: expect.any(String),
            club: "Minecraft adventurers",
            role: "Primary",
            sessions: "2",
            fee: "€50.00",
            total: "€100.00",
          },
        ],
      },
    ]);
  });

  it("shows an unset fee as a neutral dash", () => {
    const unpriced = contentOf(mikael)
      .segments.flatMap((segment) => segment.clubs)
      .find((club) => club.club === "Rakentajakerho Mäntyranta");

    expect(unpriced?.fee).toBe("—");
    expect(unpriced?.total).toBe("—");
  });

  it("details every dated line, paying or not, with its amount and why", () => {
    expect(contentOf(aino).sessionsByClub).toEqual([
      {
        productId: expect.any(String),
        role: "Primary",
        heading: "Pelikerho Kivikko · Primary",
        fee: "Fee / session €65.00",
        sessions: [
          { date: "Mon 5/4/2026", group: "Ryhmä A", status: "Recorded", details: [], amount: "€65.00", pays: true },
          { date: "Mon 5/11/2026", group: "Ryhmä A", status: "Away — Mikael Rinne substituted", details: [], amount: "€0.00", pays: false },
          { date: "Mon 5/18/2026", group: "Ryhmä A", status: "Recorded", details: [], amount: "€65.00", pays: true },
          { date: "Mon 5/25/2026", group: "Ryhmä A", status: "Upcoming", details: [], amount: "€0.00", pays: false },
        ],
        total: { label: "Total", sessions: "2 sessions", amount: "€130.00" },
      },
      {
        productId: expect.any(String),
        role: "Primary",
        heading: "Minecraft adventurers · Primary",
        fee: "Fee / session €50.00",
        sessions: [
          { date: "Tue 5/5/2026", group: "Group 1", status: "Recorded", details: [], amount: "€50.00", pays: true },
          {
            date: "Tue 5/12/2026",
            group: "Group 1",
            status: "Not recorded",
            details: ["No report, note or attendance yet"],
            amount: "€0.00",
            pays: false,
          },
          { date: "Tue 5/19/2026", group: "Group 1", status: "Recorded", details: [], amount: "€50.00", pays: true },
          { date: "Tue 5/26/2026", group: "Group 1", status: "Upcoming", details: [], amount: "€0.00", pays: false },
        ],
        total: { label: "Total", sessions: "2 sessions", amount: "€100.00" },
      },
    ]);
  });

  it("lists as many lines as the page has, every club line included", () => {
    const content = contentOf(mikael);

    expect(content.sessionsByClub).toHaveLength(mikael.clubs.length);
    expect(
      content.sessionsByClub.reduce((n, club) => n + club.sessions.length, 0),
    ).toBe(mikael.clubs.reduce((n, club) => n + club.lines.length, 0));
  });

  it("names who a substitute covered for, and dashes every amount of an unset fee", () => {
    const clubs = contentOf(mikael).sessionsByClub;
    const cover = clubs
      .flatMap((club) => club.sessions)
      .find((session) => session.date === "Mon 5/11/2026");
    expect(cover?.status).toBe("Recorded");
    expect(cover?.details).toEqual(["Substituting for Aino Kallio"]);

    const unpriced = clubs.find((club) =>
      club.heading.startsWith("Rakentajakerho Mäntyranta"),
    );
    expect(unpriced?.fee).toBe("Fee / session —");
    expect(unpriced?.total.amount).toBe("—");
    expect(unpriced?.sessions.map((session) => session.amount)).toEqual(
      unpriced?.sessions.map(() => "—"),
    );
    expect(unpriced?.sessions.map((session) => session.status)).toContain(
      "Cancelled",
    );
  });

  it("words the away line with no substitute the way the page does", () => {
    const noSub: GeduInvoice = {
      ...aino,
      clubs: aino.clubs.map((club) => ({
        ...club,
        lines: club.lines.map((line) => ({ ...line, substitute: null })),
      })),
    };
    const away = contentOf(noSub)
      .sessionsByClub.flatMap((club) => club.sessions)
      .find((session) => session.date === "Mon 5/11/2026");

    expect(away?.status).toBe("Away — no substitute");
  });

  it("words the completeness statement and the detail in the page locale", () => {
    const content = contentOf(aino, "fi");

    expect(content.completeness.title).toBe("Erittely ei ole vielä valmis");
    expect(content.completeness.unrecorded?.sessions).toEqual([
      "ti 12.5.2026 · Minecraft adventurers · Group 1",
    ]);
    expect(content.footer).toBe("School of Gaming · Aino Kallio · toukokuu 2026");
  });

  it("formats money the way the page does, with no narrow or thin space", () => {
    const content = contentOf(aino, "fr");
    const total = content.summary.at(-1)?.figure ?? "";

    expect(total).toBe("230,00\u00A0€");
    for (const text of [
      ...content.summary.map((row) => row.figure),
      content.figuresAsOf,
      content.month,
    ]) {
      expect(text).not.toMatch(/[\u202F\u2009]/);
    }
  });
});

describe("pdfText", () => {
  it("turns the narrow no-break space and the thin space into a no-break space", () => {
    expect(pdfText("1\u202F234,50\u00A0€")).toBe(
      "1\u00A0234,50\u00A0€",
    );
    expect(pdfText("10\u2009h")).toBe("10\u00A0h");
  });
});

describe("renderGeduInvoicePdf", () => {
  it.each(["en", "fi", "fr"] as const)("renders a PDF in %s", async (locale) => {
    const pdf = await renderGeduInvoicePdf({
      invoice: invoiceOf("was-away"),
      monthStart: GEDU_INVOICING_WORKING_MONTH,
      locale,
      now: GEDU_INVOICING_NOW,
      t: translator(locale),
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-8).toString("latin1")).toContain("%%EOF");
  });

  it("renders a month with nothing to invoice", async () => {
    const pdf = await renderGeduInvoicePdf({
      invoice: { ...invoiceOf("was-away"), clubs: [] },
      monthStart: GEDU_INVOICING_WORKING_MONTH,
      locale: "en",
      now: GEDU_INVOICING_NOW,
      t: translator("en"),
    });

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
