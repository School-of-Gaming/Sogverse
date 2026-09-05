import { describe, expect, it } from "vitest";

import { YTY_FAMILIES } from "../../../packages/sog-ui/src/tokens/brand";
import { PRODUCT_KIND_GRAMMAR } from "../../../packages/sog-ui/src/tokens/grammar";

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
