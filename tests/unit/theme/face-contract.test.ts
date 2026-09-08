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

/**
 * The `next/font` call that defines one face's variable.
 *
 * Sliced out of the layout's text rather than parsed. next/font requires its
 * options to be a static object literal, so one face's load is exactly the
 * `Family({ … })` around the variable it defines, and the nearest `({` before
 * that variable and `})` after it are that call's own brackets.
 */
function faceCall(layout: string, variable: string): string {
  const at = layout.indexOf(`"${variable}"`);
  const open = layout.lastIndexOf("({", at);
  const close = layout.indexOf("})", at);
  return layout.slice(open, close + 2);
}

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

  /**
   * Every style a face declares is loaded, because a style that is not loaded
   * is not drawn: the browser synthesises it, which on the serif is a skew of
   * the upright alphabet rather than the italic one, a different alphabet
   * altogether.
   *
   * How the assertion treats an omitted option: `normal` is next/font's own
   * default, so a face drawn upright only may leave `style` out entirely, and
   * every face but the serif does. The check is therefore on the option where
   * it is present — it has to name every style the face declares — and on its
   * absence only where the face declares nothing but `normal`. A face that
   * gains a second style and does not gain the option fails on that second
   * half rather than passing by default.
   */
  it.each(Object.entries(FACES))(
    "%s is loaded in every style it declares",
    (id, face) => {
      const call = faceCall(readFileSync(APP_LAYOUT, "utf8"), face.variable);
      const option = /style:\s*(\[[^\]]*\]|"[^"]*")/.exec(call);
      if (option === null) {
        expect(
          face.styles,
          `src/app/layout.tsx loads ${face.name} with no style option, which is next/font's "normal" — ${id} declares more than that`,
        ).toEqual(["normal"]);
        return;
      }
      for (const style of face.styles) {
        expect(
          option[1].includes(`"${style}"`),
          `src/app/layout.tsx does not load ${face.name} in ${style}, which ${id} declares`,
        ).toBe(true);
      }
    },
  );
});
