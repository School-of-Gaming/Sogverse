import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { FACES } from "../../../packages/sog-ui/src/tokens/typography";

/**
 * The face contract, honoured on Sogverse's side of the seam.
 *
 * @sog/ui names the faces and the semantic token each one answers to; the
 * consumer loads the font files and defines the CSS variable that token points
 * at. next/font reads its options statically and so cannot import those names
 * from the token source, which leaves exactly one way for the two halves to
 * drift — a face renamed on one side and not the other, with the page still
 * looking styled because the token falls through to a UA stack. This is the
 * check that closes it for the app; the sibling under `tests/unit/sog-ui/` makes
 * the same assertion against the demo, which is the contract's reference
 * implementation.
 *
 * Every face is asserted, including the ones nothing renders yet: the contract
 * is the whole list, so a face left unloaded is a hole that only shows up the
 * day a surface first asks for it.
 */

// Anchored on the Vitest project root rather than on `import.meta.url`, which a
// test runner does not have to expose as a file: URL.
const APP_LAYOUT = join(process.cwd(), "src", "app", "layout.tsx");

describe("the face contract", () => {
  // Vitest's `it.each([])` registers nothing and the suite passes green, so the
  // table is floored: an emptied face list must fail rather than vanish.
  it("has every face to check", () => {
    expect(Object.keys(FACES).length).toBeGreaterThanOrEqual(4);
  });

  it.each(Object.entries(FACES))(
    "%s is defined by the app's root layout",
    (id, face) => {
      const layout = readFileSync(APP_LAYOUT, "utf8");
      expect(
        layout.includes(`"${face.variable}"`),
        `src/app/layout.tsx does not define ${face.variable} for ${id}`,
      ).toBe(true);
    },
  );
});
