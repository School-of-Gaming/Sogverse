import { describe, expect, it } from "vitest";
import { VAT_BY_PRODUCT_TYPE, vatForProductType } from "@/lib/stripe/vat";
import { Constants } from "@/types/database.types";

/**
 * The mapping is the single place a tax code or rate is written down, and it is
 * money-critical: the tax code decides what a customer is charged, and the
 * display rate is the number an admin reads off the product form. Nothing else
 * pins the full table — the helper tests exercise a camp and a club in passing
 * — so this is the test that makes an accidental edit to any row visible.
 */
describe("VAT_BY_PRODUCT_TYPE", () => {
  it("pins treatment, tax code and display rate for every product type", () => {
    expect(VAT_BY_PRODUCT_TYPE).toEqual({
      camp: {
        treatment: "reduced",
        taxCode: "txcd_35010001",
        displayRate: 0.135,
      },
      consumer_club: {
        treatment: "standard",
        taxCode: "txcd_10000000",
        displayRate: 0.255,
      },
      event: {
        treatment: "standard",
        taxCode: "txcd_10000000",
        displayRate: 0.255,
      },
      municipality_club: {
        treatment: "standard",
        taxCode: "txcd_10000000",
        displayRate: 0.255,
      },
    });
  });

  it("covers every product type the schema defines", () => {
    // The Record type already forces this at compile time; the runtime pin is
    // for the day product_type gains a value and someone reaches for a cast.
    expect(Object.keys(VAT_BY_PRODUCT_TYPE).sort()).toEqual(
      [...Constants.public.Enums.product_type].sort(),
    );
  });

  it("returns the row for a given type", () => {
    expect(vatForProductType("camp")).toBe(VAT_BY_PRODUCT_TYPE.camp);
  });
});

/**
 * Acceptance criterion from the finance-data work: both current rates render
 * their decimal — "13,5 %" and "25,5 %" in Finnish, never "14 %" or "26 %".
 * `Intl.NumberFormat`'s percent style defaults to zero fraction digits, so the
 * panel's `maximumFractionDigits: 1` is load-bearing; this pins the exact
 * option set the admin form uses so removing it in a tidy-up fails a test
 * instead of silently rounding a real rate away.
 */
describe("percent formatting of the display rates", () => {
  // Intl separates the number from "%" with a no-break space (exact flavor
  // varies by ICU version); the criterion is the digits, so normalize it.
  const plainSpaces = (formatted: string) =>
    formatted.replace(/[  ]/g, " ");

  const format = (rate: number) =>
    plainSpaces(
      new Intl.NumberFormat("fi", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(rate),
    );

  it("renders the reduced rate with its decimal in Finnish", () => {
    expect(format(VAT_BY_PRODUCT_TYPE.camp.displayRate)).toBe("13,5 %");
  });

  it("renders the standard rate with its decimal in Finnish", () => {
    expect(format(VAT_BY_PRODUCT_TYPE.consumer_club.displayRate)).toBe(
      "25,5 %",
    );
  });

  it("rounds both rates wrong without maximumFractionDigits — the default the panel must not use", () => {
    const defaultFormat = new Intl.NumberFormat("fi", { style: "percent" });
    expect(
      plainSpaces(defaultFormat.format(VAT_BY_PRODUCT_TYPE.camp.displayRate)),
    ).toBe("14 %");
    expect(
      plainSpaces(
        defaultFormat.format(VAT_BY_PRODUCT_TYPE.consumer_club.displayRate),
      ),
    ).toBe("26 %");
  });
});
