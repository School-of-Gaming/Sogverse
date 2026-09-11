import { describe, expect, it } from "vitest";

import { FACES } from "../../packages/sog-ui/src/tokens/typography";

/**
 * The face contract, stated once.
 *
 * @sog/ui names the faces and the semantic token each one answers to; a
 * consumer loads the font files and defines the CSS variable that token points
 * at. next/font reads its options statically and so cannot import those names
 * from the token source, which leaves exactly one way for the two halves to
 * drift — a face renamed on one side and not the other, with the page still
 * looking styled because the token falls through to a UA stack.
 *
 * Two layouts honour that contract — the app's root layout and the demo's,
 * which is the contract's reference implementation — and they were being held
 * to it by two copies of the same suite. A contract asserted twice is a
 * contract that can be strengthened once: the copy that gained the check was
 * the one whose layout the change happened to be about, and the other went on
 * passing. So the assertions live here, the two test files each name a layout,
 * and there is one place to add the next one.
 */

/**
 * The `next/font` call that defines one face's variable, or `null` when no call
 * defines it.
 *
 * Sliced out of the layout's text rather than parsed. next/font requires its
 * options to be a static object literal, so one face's load is exactly the
 * `Family({ … })` around the variable it defines, and the nearest `({` before
 * that variable and `})` after it are that call's own brackets.
 *
 * `null` rather than a slice from a not-found index: a missing variable makes
 * every bracket search return -1, and slicing from there hands the option
 * regexes the tail of the file, where they match something plausible from an
 * entirely different face. The absence is the finding, so it is reported as
 * itself.
 */
function faceCall(layout: string, variable: string): string | null {
  const at = layout.indexOf(`"${variable}"`);
  if (at === -1) {
    return null;
  }
  const open = layout.lastIndexOf("({", at);
  const close = layout.indexOf("})", at);
  if (open === -1 || close === -1) {
    return null;
  }
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
 * The identifier each `next/font` import is available under, mapped to the name
 * it was imported as.
 *
 * An alias resolves to the imported name, which is the face next/font actually
 * loads. The module specifier is matched rather than the identifier, so a
 * default import (`localFont` from `next/font/local`) is caught alongside the
 * named Google ones — a face loaded from a file on disk is a family the library
 * never named just as surely as a fifth Google one is — and either quote is
 * accepted, because the spelling of a specifier is not a property anything
 * about faces should depend on.
 */
function fontImports(layout: string): Map<string, string> {
  const imported = new Map<string, string>();
  for (const statement of layout.matchAll(
    /import\s+([^;]+?)\s+from\s+["']next\/font\/[a-z]+["']/g,
  )) {
    for (const clause of statement[1].replace(/[{}]/g, " ").split(",")) {
      const parts = clause.trim().split(/\s+as\s+/);
      const name = parts.at(0);
      if (name === undefined || name.length === 0) {
        continue;
      }
      imported.set((parts.at(1) ?? name).trim(), name.trim());
    }
  }
  return imported;
}

/**
 * Every family the layout loads, by the name next/font knows it as.
 *
 * Two readings, unioned. The imports say what was brought in; the **calls** say
 * what is actually loaded — an identifier immediately followed by an options
 * object carrying a `variable:`, which is a font loader and nothing else in a
 * layout. Reading the imports alone was the hole: it matched one static,
 * double-quoted specifier, so a single-quoted one, a `await import()`, or a
 * loader reached through anything but a bare import statement loaded a fifth
 * family that this check could not see. Both are kept because they fail
 * differently — an import with its call deleted is still a family declared
 * here, and a call whose loader arrived some other way is still a family
 * loaded.
 */
function fontLoaders(layout: string): string[] {
  const imported = fontImports(layout);
  const called = [
    ...layout.matchAll(/([A-Za-z_$][\w$]*)\s*\(\s*\{([^{}]*)\}\s*\)/g),
  ]
    .filter((call) => /\bvariable\s*:/.test(call[2]))
    .map((call) => imported.get(call[1]) ?? call[1]);
  return [...new Set([...imported.values(), ...called])];
}

/**
 * The identifier next/font exposes each face under: the family name with its
 * spaces as underscores, which is next/font's own convention.
 */
const FACE_LOADERS = Object.values(FACES).map((face) =>
  face.name.replace(/ /g, "_"),
);

/**
 * Registers the whole face contract against one layout.
 *
 * It takes the layout's *text*, not its path — the caller reads the file, which
 * is where the path is a literal and where a test names the layout it is about.
 * `label` is how that layout is named in every title and every failure message,
 * so a run tells you which of the two halves of the seam broke without opening
 * anything.
 */
export function describeFaceContract(layout: string, label: string): void {
  /**
   * The call that loads a face, with the missing-variable case reported first.
   *
   * A face with no variable in the layout fails the "is defined by" assertion
   * above; without this, it would *also* fail each option assertion with a
   * message about weights or subsets, which describes a symptom rather than the
   * fault.
   */
  function callFor(variable: string, id: string): string {
    const call = faceCall(layout, variable);
    expect(
      call,
      `${label} does not define ${variable} for ${id}, so there is no load to check`,
    ).not.toBeNull();
    return call!;
  }

  describe("the face contract", () => {
    // Vitest's `it.each([])` registers nothing and the suite passes green, so
    // the table is floored: an emptied face list must fail rather than vanish.
    it("has every face to check", () => {
      expect(Object.keys(FACES).length).toBeGreaterThanOrEqual(4);
    });

    it.each(Object.entries(FACES))(`%s is defined by ${label}`, (id, face) => {
      expect(
        layout.includes(`"${face.variable}"`),
        `${label} does not define ${face.variable} for ${id}`,
      ).toBe(true);
    });

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
      `%s is loaded in every style it declares by ${label}`,
      (id, face) => {
        const option = /style:\s*(\[[^\]]*\]|"[^"]*")/.exec(
          callFor(face.variable, id),
        );
        if (option === null) {
          expect(
            face.styles,
            `${label} loads ${face.name} with no style option, which is next/font's "normal" — ${id} declares more than that`,
          ).toEqual(["normal"]);
          return;
        }
        for (const style of face.styles) {
          expect(
            option[1].includes(`"${style}"`),
            `${label} does not load ${face.name} in ${style}, which ${id} declares`,
          ).toBe(true);
        }
      },
    );

    /**
     * Exactly the weights a face declares are loaded. A weight the consumer
     * forgets is not drawn — the browser thickens the regular to stand in for
     * it, which is a smeared bold that still reads as styled and so is never
     * reported — and a weight loaded past the list is a file every visitor to
     * the page downloads and nothing ever sets.
     */
    it.each(Object.entries(FACES))(
      `%s is loaded in exactly the weights it declares by ${label}`,
      (id, face) => {
        const weights = optionValues(
          callFor(face.variable, id),
          WEIGHT_OPTION,
        );
        expect(
          weights,
          `${label} loads ${face.name} with no weight option — ${id} declares ${face.weights.join(", ")}`,
        ).not.toBeNull();
        expect(
          new Set(weights),
          `${label} does not load ${face.name} in exactly the weights ${id} declares`,
        ).toEqual(new Set(face.weights.map(String)));
      },
    );

    /**
     * Exactly the subsets a face declares are requested. `latin-ext` dropped
     * from a face is the failure that hides best: the page is styled, and only
     * the Finnish and French letters inside a word — ä, ö, é — fall through to
     * the fallback stack, so a name changes face halfway across.
     */
    it.each(Object.entries(FACES))(
      `%s is loaded in exactly the subsets it declares by ${label}`,
      (id, face) => {
        const subsets = optionValues(
          callFor(face.variable, id),
          SUBSETS_OPTION,
        );
        expect(
          subsets,
          `${label} loads ${face.name} with no subsets option — ${id} declares ${face.subsets.join(", ")}`,
        ).not.toBeNull();
        expect(
          new Set(subsets),
          `${label} does not load ${face.name} in exactly the subsets ${id} declares`,
        ).toEqual(new Set(face.subsets));
      },
    );
  });

  /**
   * **The completeness check: the layout loads the faces the library names and
   * no other.**
   *
   * The assertions above run outward from `FACES` — every face the library
   * names is defined here — and that direction alone is how a fifth family
   * lived in the app's layout for months: Press Start 2P was loaded, given a
   * variable and spent on five surfaces while every face in the list was also
   * present, so nothing was ever missing and no test had anything to say. This
   * runs the other way, from the file back to the list, which is what turns the
   * enumeration into a command rather than an inventory. A face the library has
   * not named cannot be loaded, and adding one means adding it to `FACES`
   * first — where it arrives with a doc comment saying what it is for, and
   * where every consumer gets it at once.
   *
   * Its companion is the lint: `next/font` is importable by the app's root
   * layout alone, so that layout is the only place a load can be written, and
   * this is the check on what it writes there.
   */
  describe("no face but the library's", () => {
    const loaders = fontLoaders(layout);

    // Floored for the same reason the face table is: a regex that stops
    // matching reports nothing and reads as a check that is holding.
    it(`finds the font loads in ${label}`, () => {
      expect(loaders.length).toBeGreaterThanOrEqual(FACE_LOADERS.length);
    });

    it.each(loaders)("%s is a family @sog/ui names", (loader) => {
      expect(
        FACE_LOADERS.includes(loader),
        `${label} loads ${loader}, which is not a face in FACES — a face the library has not named cannot be loaded, whether or not it exists in the brand's art. See packages/sog-ui/src/tokens/typography.ts.`,
      ).toBe(true);
    });
  });
}
