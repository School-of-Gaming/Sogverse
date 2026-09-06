import { describe, expect, it } from "vitest";

import { YTY_FAMILIES } from "../../../packages/sog-ui/src/tokens/brand";
import {
  PRODUCT_KIND_GRAMMAR,
  YTY_ELEMENT_GRAMMAR,
} from "../../../packages/sog-ui/src/tokens/grammar";

/**
 * The tone grammar's two mechanisms, neither of which is a value.
 *
 * A test asserting that camp maps to Valor would only restate the table, and
 * would fail the day the owner rules a different family — which is a decision,
 * not a regression. What is worth pinning is what makes the table *work*: every
 * row names a family the palette actually ships, and no two rows name the same
 * one.
 *
 * The second is the load-bearing half. The table exists so that an admin can
 * tell four product kinds apart at a glance, and two kinds sharing a family
 * would leave two of them drawn identically — a mapping that compiles, renders,
 * and silently says nothing.
 */
describe("PRODUCT_KIND_GRAMMAR", () => {
  const rows = Object.entries(PRODUCT_KIND_GRAMMAR);

  it("maps every kind to a family the palette ships", () => {
    for (const [kind, row] of rows) {
      expect(YTY_FAMILIES, `${kind} names a family that exists`).toHaveProperty(
        row.family,
      );
    }
  });

  it("gives every kind a family of its own", () => {
    const families = rows.map(([, row]) => row.family);
    expect(new Set(families).size).toBe(rows.length);
  });
});

/**
 * The element table's mechanisms, on the same principle as the kind table's.
 *
 * Which mark an element takes is a ruling and may change; that every element
 * has one, that no two share one, and that what is stored is something React
 * can render are the properties the table has to keep to work at all. The
 * third is worth pinning because the glyphs are values imported from another
 * package: a mark renamed or dropped upstream would otherwise arrive here as
 * `undefined`, which type-checks against nothing and fails only at the first
 * render of whichever surface happened to draw it.
 */
describe("YTY_ELEMENT_GRAMMAR", () => {
  const rows = Object.entries(YTY_ELEMENT_GRAMMAR);

  it("gives every family a glyph", () => {
    expect(rows.map(([family]) => family).sort()).toEqual(
      Object.keys(YTY_FAMILIES).sort(),
    );
  });

  it("gives every family a glyph of its own", () => {
    const glyphs = rows.map(([, row]) => row.glyph);
    expect(new Set(glyphs).size).toBe(rows.length);
  });

  it("stores lucide components, not names or nothing", () => {
    for (const [family, row] of rows) {
      // A lucide mark is what `createLucideIcon` returns: a forwardRef exotic
      // component — an object at runtime, not a function — carrying the mark's
      // own name as its displayName.
      expect(row.glyph, `${family} has a glyph`).toBeTruthy();
      expect(typeof row.glyph, `${family}'s glyph is renderable`).toBe("object");
      expect(
        row.glyph.displayName,
        `${family}'s glyph names itself`,
      ).toEqual(expect.any(String));
    }
  });
});
