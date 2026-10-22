import { describe, expect, it } from "vitest";
import type { LandingSection } from "@/lib/landing-pages/sections";
import {
  landingProductPicks,
  listingAbsenceReasons,
} from "@/services/landing-pages/landing-pages.product-picks";
import type { ProductListingFactsRow } from "@/services/products/products.service";

/**
 * **Which of a page's picks readers are shown, and why the others are not** —
 * what the status page and the MCP read tools report per products section.
 * Shown is the listing's answer, the one the public page draws by; the
 * reasons only explain an absence, every one that holds, in the product's own
 * timezone for whether its term has ended.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = new Date("2026-10-16T12:00:00Z");

function facts(n: number, overrides: Partial<ProductListingFactsRow> = {}): ProductListingFactsRow {
  return {
    id: id(n),
    is_visible: true,
    start_date: "2026-09-01",
    end_date: null,
    timezone: "Europe/Helsinki",
    product_translations: [
      { locale: "fi", name: `Kerho ${n}` },
      { locale: "en", name: `Club ${n}` },
    ],
    ...overrides,
  };
}

const SECTIONS: LandingSection[] = [
  { id: id(1), type: "hero" },
  { id: id(2), type: "products", background: "default", productIds: [id(10), id(11), id(12), id(13), id(14)] },
  { id: id(3), type: "text", background: "default", imageSide: "start" },
  { id: id(4), type: "products", background: "default", productIds: [id(15)] },
];

const FACTS = [
  facts(10),
  facts(11, { end_date: "2026-10-15" }),
  facts(12, { is_visible: false }),
  // 13 has no row: no product has the id.
  facts(14, { is_visible: false, end_date: "2026-06-30" }),
  facts(15, { end_date: "2026-10-16" }),
];

describe("landingProductPicks", () => {
  const report = landingProductPicks(SECTIONS, new Set([id(10), id(15)]), FACTS, NOW);

  it("reports each products section by its position, picks in the admin's order", () => {
    expect(report.map((section) => [section.sectionId, section.sectionNumber])).toEqual([
      [id(2), 2],
      [id(4), 4],
    ]);
    expect(report[0].picks.map((pick) => pick.productId)).toEqual(
      [10, 11, 12, 13, 14].map(id),
    );
  });

  it("says why each hidden pick is not shown, every reason that holds", () => {
    expect(report[0].picks.map((pick) => [pick.shown, pick.reasons])).toEqual([
      [true, []],
      [false, ["ended"]],
      [false, ["notListed"]],
      [false, ["gone"]],
      [false, ["notListed", "ended"]],
    ]);
    expect(report[0].shownCount).toBe(1);
  });

  it("judges a term ended in the product's own timezone — one ending today is still on", () => {
    expect(report[1].picks[0]).toMatchObject({ shown: true, reasons: [] });
  });

  it("names a pick in every language it is written in, in locale order, and a gone one by none", () => {
    expect(report[0].picks[0].names).toEqual([
      { locale: "en", name: "Club 10" },
      { locale: "fi", name: "Kerho 10" },
    ]);
    expect(report[0].picks[3].names).toEqual([]);
  });

  it("takes the listing's word over the facts when the two reads disagree", () => {
    const [section] = landingProductPicks(
      [{ id: id(2), type: "products", background: "default", productIds: [id(10)] }],
      new Set(),
      [facts(10)],
      NOW,
    );
    expect(section.picks[0]).toMatchObject({ shown: false, reasons: ["notListed"] });
    expect(section.shownCount).toBe(0);
  });

  it("explains an absence from a product's own row, as the MCP product list does", () => {
    expect(listingAbsenceReasons(facts(10), NOW)).toEqual([]);
    expect(
      listingAbsenceReasons(facts(14, { is_visible: false, end_date: "2026-06-30" }), NOW),
    ).toEqual(["notListed", "ended"]);
  });

  it("reports nothing for a page with no products section", () => {
    expect(landingProductPicks([{ id: id(1), type: "hero" }], new Set(), [], NOW)).toEqual([]);
  });
});
