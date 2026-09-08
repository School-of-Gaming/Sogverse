import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { renderTheme } from "../../../packages/sog-ui/src/tokens/generate";
import {
  FACES,
  MAIL_FACE,
} from "../../../packages/sog-ui/src/tokens/typography";

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
    "%s is defined by the demo layout",
    (id, face) => {
      const layout = readFileSync(DEMO_LAYOUT, "utf8");
      expect(
        layout.includes(`"${face.variable}"`),
        `the demo layout does not define ${face.variable} for ${id}`,
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
      const call = faceCall(readFileSync(DEMO_LAYOUT, "utf8"), face.variable);
      const option = /style:\s*(\[[^\]]*\]|"[^"]*")/.exec(call);
      if (option === null) {
        expect(
          face.styles,
          `the demo layout loads ${face.name} with no style option, which is next/font's "normal" — ${id} declares more than that`,
        ).toEqual(["normal"]);
        return;
      }
      for (const style of face.styles) {
        expect(
          option[1].includes(`"${style}"`),
          `the demo layout does not load ${face.name} in ${style}, which ${id} declares`,
        ).toBe(true);
      }
    },
  );
});

/**
 * **The completeness check: the demo layout loads the faces the library names
 * and no other.**
 *
 * The assertions above run outward from `FACES` — every face the library names
 * is defined here — and that direction alone is how a fifth family lived in the
 * app's own layout for months: it was loaded, given a variable and spent on
 * five surfaces while every face in the list was also present, so nothing was
 * ever missing and no test had anything to say. This runs the other way, from
 * the file back to the list, which is what turns the enumeration into a command
 * rather than an inventory. The demo is the contract's reference
 * implementation, so it is held to the half a consumer is most likely to break:
 * a face the library has not named cannot be loaded, and adding one means
 * adding it to `FACES` first.
 */
describe("no face but the library's", () => {
  const loaders = fontLoaders(readFileSync(DEMO_LAYOUT, "utf8"));

  // Floored for the same reason the face table is: a regex that stops matching
  // reports nothing and reads as a check that is holding.
  it("finds the layout's font loads", () => {
    expect(loaders.length).toBeGreaterThanOrEqual(FACE_LOADERS.length);
  });

  it.each(loaders)("%s is a family @sog/ui names", (loader) => {
    expect(
      FACE_LOADERS.includes(loader),
      `the demo layout loads ${loader}, which is not a face in FACES — a face the library has not named cannot be loaded, whether or not it exists in the brand's art. See packages/sog-ui/src/tokens/typography.ts.`,
    ).toBe(true);
  });
});

/**
 * The mail face is the reader's own, and stays outside the loaded list.
 *
 * Two properties, both of them mechanisms rather than values. "No webfont in
 * mail" is a rule about the *relationship* between two exports, so it is
 * checkable: whatever the stack grows to say, it may not name a family the
 * consumer loads, because a mail client would not fetch it and Outlook on
 * Windows answers a missing declared web font with a serif. And the mail face
 * has no CSS existence at all — a token emitted for it would mean a screen
 * could ask for it by class, which is precisely what "never a screen face"
 * denies.
 */
describe("the mail face", () => {
  it.each(Object.entries(FACES))(
    "does not name %s in its stack",
    (id, face) => {
      expect(
        MAIL_FACE.stack.toLowerCase().includes(face.name.toLowerCase()),
        `the mail face's stack names ${face.name}, which is a face the consumer loads — a mail loads nothing`,
      ).toBe(false);
    },
  );

  it("is not emitted as a theme token", () => {
    const declared = [...renderTheme().matchAll(/(--font-[a-z-]+)\s*:/g)]
      .map((match) => match[1])
      .filter((token) => !token.endsWith("-weight"));
    expect(
      new Set(declared),
      "the theme declares a face token the FACES list does not name — the mail face has no token, because it is not a CSS face",
    ).toEqual(new Set(Object.values(FACES).map((face) => face.token)));
    expect(renderTheme().includes(MAIL_FACE.stack)).toBe(false);
  });
});
