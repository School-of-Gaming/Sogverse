import { describe, it, expect } from "vitest";
import { buildGeduInvoicing } from "@/components/gedu-invoicing/build-gedu-invoicing";
import { filterGeduInvoices } from "@/components/gedu-invoicing/filter-gedu-invoices";
import {
  GEDU_INVOICING_NOW,
  GEDU_INVOICING_WORKING_MONTH,
  geduInvoicingMonthFixture,
} from "@/components/gedu-invoicing/mock-gedu-invoicing-fixtures";

/**
 * The admin page's search over the month's gedus, against the preview month:
 * Aino Kallio, Mikael Rinne and Sara Vuorela, each with an address of their own.
 */

const { gedus } = buildGeduInvoicing({
  snapshot: geduInvoicingMonthFixture(GEDU_INVOICING_WORKING_MONTH),
  locale: "en",
  now: GEDU_INVOICING_NOW,
});

function names(query: string) {
  return filterGeduInvoices(gedus, query).map((gedu) => gedu.firstName);
}

describe("filterGeduInvoices", () => {
  it("keeps every gedu, in the builder's order, for a blank query", () => {
    expect(gedus).toHaveLength(3);
    expect(filterGeduInvoices(gedus, "")).toBe(gedus);
    expect(filterGeduInvoices(gedus, "   ")).toBe(gedus);
  });

  it("matches a first name or a last name, ignoring case", () => {
    expect(names("aino")).toEqual(["Aino"]);
    expect(names("RINNE")).toEqual(["Mikael"]);
  });

  it("matches across the first and last name", () => {
    expect(names("sara vuo")).toEqual(["Sara"]);
    expect(names("  Kallio ")).toEqual(["Aino"]);
  });

  it("matches the email", () => {
    expect(names("mikael.rinne@")).toEqual(["Mikael"]);
    // Every fixture address shares its domain, so a domain matches them all.
    expect(names("EXAMPLE.COM")).toEqual(gedus.map((gedu) => gedu.firstName));
  });

  it("matches a substring anywhere, not only a prefix", () => {
    expect(names("uore")).toEqual(["Sara"]);
  });

  it("matches nobody on a query none of them carries", () => {
    expect(names("zz-nobody")).toEqual([]);
  });
});
