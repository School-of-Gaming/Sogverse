import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FACES } from "../../../packages/sog-ui/src/tokens/typography";

/**
 * The face contract, honoured across the seam it spans.
 *
 * The package names the faces; a consumer loads the files and defines the CSS
 * variable each name points at. next/font reads its options statically and so
 * cannot import those names from the token source, which leaves exactly one way
 * for the two halves to drift — a face renamed on one side and not the other,
 * with the page still looking styled because the token falls back to a UA
 * stack. This is the check that closes it, against the demo layout, which is
 * the contract's reference implementation.
 */

// Anchored on the Vitest project root rather than on `import.meta.url`, which a
// test runner does not have to expose as a file: URL.
const DEMO_LAYOUT = join(
  process.cwd(),
  "packages",
  "sog-ui",
  "demo",
  "app",
  "layout.tsx",
);

describe("the face contract", () => {
  // Vitest's `it.each([])` registers nothing and the suite passes green, so the
  // table is floored: an emptied face list must fail rather than vanish.
  it("has every face to check", () => {
    expect(Object.keys(FACES).length).toBeGreaterThanOrEqual(4);
  });

  it.each(Object.entries(FACES))(
    "%s is defined by the demo layout",
    (id, face) => {
      const layout = readFileSync(DEMO_LAYOUT, "utf8");
      expect(
        layout.includes(`"${face.variable}"`),
        `the demo layout does not define ${face.variable} for ${id}`,
      ).toBe(true);
    },
  );
});
