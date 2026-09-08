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

const WEIGHT_OPTION = /weight:\s*(\[[^\]]*\]|"[^"]*")/;
const SUBSETS_OPTION = /subsets:\s*(\[[^\]]*\]|"[^"]*")/;

/**
 * The values one option of a face's load is written with.
 *
 * next/font takes either a list or a single value — `weight: ["400", "600"]`
 * and `weight: "600"` are both legal — so both spellings are read as the list
 * they mean. `null` is the option being absent altogether, which is a different
 * finding from it being present and wrong.
 */
function optionValues(call: string, option: RegExp): string[] | null {
  const written = option.exec(call);
  if (written === null) {
    return null;
  }
  return [...written[1].matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

/**
 * Every font loader the layout imports, by the identifier it is imported under.
 *
 * The module specifier is matched rather than the identifier, so a default
 * import (`localFont` from `next/font/local`) is caught alongside the named
 * Google ones — a face loaded from a file on disk is a family the library never
 * named just as surely as a fifth Google one is. An alias resolves to the
 * imported name, which is the face next/font actually loads.
 */
function fontLoaders(layout: string): string[] {
  return [
    ...layout.matchAll(/import\s+([^;]+?)\s+from\s+"next\/font\/[a-z]+"/g),
  ].flatMap((match) =>
    match[1]
      .replace(/[{}]/g, " ")
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/)[0].trim())
      .filter((name) => name.length > 0),
  );
}

/**
 * The identifier next/font exposes each face under: the family name with its
 * spaces as underscores, which is next/font's own convention.
 */
const FACE_LOADERS = Object.values(FACES).map((face) =>
  face.name.replace(/ /g, "_"),
);

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

  /**
   * Exactly the weights a face declares are loaded. A weight the consumer
   * forgets is not drawn — the browser thickens the regular to stand in for it,
   * which is a smeared bold that still reads as styled and so is never
   * reported — and a weight loaded past the list is a file every visitor to the
   * page downloads and nothing ever sets.
   */
  it.each(Object.entries(FACES))(
    "%s is loaded in exactly the weights it declares",
    (id, face) => {
      const call = faceCall(readFileSync(APP_LAYOUT, "utf8"), face.variable);
      const weights = optionValues(call, WEIGHT_OPTION);
      expect(
        weights,
        `src/app/layout.tsx loads ${face.name} with no weight option — ${id} declares ${face.weights.join(", ")}`,
      ).not.toBeNull();
      expect(
        new Set(weights),
        `src/app/layout.tsx does not load ${face.name} in exactly the weights ${id} declares`,
      ).toEqual(new Set(face.weights.map(String)));
    },
  );

  /**
   * Exactly the subsets a face declares are requested. `latin-ext` dropped from
   * a face is the failure that hides best: the page is styled, and only the
   * Finnish and French letters inside a word — ä, ö, é — fall through to the
   * fallback stack, so a name changes face halfway across.
   */
  it.each(Object.entries(FACES))(
    "%s is loaded in exactly the subsets it declares",
    (id, face) => {
      const call = faceCall(readFileSync(APP_LAYOUT, "utf8"), face.variable);
      const subsets = optionValues(call, SUBSETS_OPTION);
      expect(
        subsets,
        `src/app/layout.tsx loads ${face.name} with no subsets option — ${id} declares ${face.subsets.join(", ")}`,
      ).not.toBeNull();
      expect(
        new Set(subsets),
        `src/app/layout.tsx does not load ${face.name} in exactly the subsets ${id} declares`,
      ).toEqual(new Set(face.subsets));
    },
  );
});

/**
 * **The completeness check: the app's root layout loads the faces the library
 * names and no other.**
 *
 * The assertions above run outward from `FACES` — every face the library names
 * is defined here — and that direction alone is how a fifth family lived in
 * this layout for months: Press Start 2P was loaded, given a variable and spent
 * on five surfaces while every face in the list was also present, so nothing
 * was ever missing and no test had anything to say. This runs the other way,
 * from the file back to the list, which is what turns the enumeration into a
 * command rather than an inventory. A face the library has not named cannot be
 * loaded here, and adding one means adding it to `FACES` first — where it
 * arrives with a doc comment saying what it is for, and where every consumer
 * gets it at once.
 *
 * Its companion is the lint: `next/font` is importable by this file alone, so
 * the layout is the only place a load can be written, and this is the check on
 * what it writes there.
 */
describe("no face but the library's", () => {
  const loaders = fontLoaders(readFileSync(APP_LAYOUT, "utf8"));

  // Floored for the same reason the face table is: a regex that stops matching
  // reports nothing and reads as a check that is holding.
  it("finds the layout's font loads", () => {
    expect(loaders.length).toBeGreaterThanOrEqual(FACE_LOADERS.length);
  });

  it.each(loaders)("%s is a family @sog/ui names", (loader) => {
    expect(
      FACE_LOADERS.includes(loader),
      `src/app/layout.tsx loads ${loader}, which is not a face in FACES — a face the library has not named cannot be loaded, whether or not it exists in the brand's art. See packages/sog-ui/src/tokens/typography.ts.`,
    ).toBe(true);
  });
});
