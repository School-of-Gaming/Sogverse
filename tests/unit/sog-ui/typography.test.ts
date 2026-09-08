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
