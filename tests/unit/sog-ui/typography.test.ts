import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { renderTheme } from "../../../packages/sog-ui/src/tokens/generate";
import {
  FACES,
  MAIL_FACE,
} from "../../../packages/sog-ui/src/tokens/typography";
import { describeFaceContract } from "../../helpers/face-contract";

/**
 * The face contract, honoured across the seam it spans, and the mail face's
 * standing outside it.
 *
 * The contract's assertions are the shared statement in
 * `tests/helpers/face-contract.ts`; this file names the demo layout, which is
 * the contract's reference implementation, and then adds the two properties
 * that belong to the package alone.
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

describeFaceContract(readFileSync(DEMO_LAYOUT, "utf8"), "the demo layout");

/**
 * The mail face is the reader's own, and stays outside the loaded list.
 *
 * Two properties, both of them mechanisms rather than values. "No webfont in
 * mail" is a rule about the *relationship* between two exports, so it is
 * checkable: whatever either stack grows to say — the primary one, and the
 * Windows-resolvable one desktop Outlook is handed — it may not name a family
 * the consumer loads, because a mail client would not fetch it and Outlook on
 * Windows answers a missing declared web font with a serif. And the mail face
 * has no CSS existence at all — a token emitted for it would mean a screen
 * could ask for it by class, which is precisely what "never a screen face"
 * denies.
 */
describe("the mail face", () => {
  // Both stacks, because the Word engine's is the same face by another route:
  // a webfont smuggled into the one an Outlook reader gets is a webfont in a
  // mail exactly as much as one in the stack every other client reads.
  const stacks = [
    ["the mail face's stack", MAIL_FACE.stack],
    ["the mail face's Word-engine stack", MAIL_FACE.wordEngineStack],
  ] as const;

  it.each(
    stacks.flatMap(([where, stack]) =>
      Object.entries(FACES).map(([id, face]) => [where, id, face.name, stack]),
    ),
  )("%s does not name %s", (where, _id, name, stack) => {
    expect(
      stack.toLowerCase().includes(name.toLowerCase()),
      `${where} names ${name}, which is a face the consumer loads — a mail loads nothing`,
    ).toBe(false);
  });

  it("is not emitted as a theme token", () => {
    const declared = [...renderTheme().matchAll(/(--font-[a-z-]+)\s*:/g)]
      .map((match) => match[1])
      .filter((token) => !token.endsWith("-weight"));
    expect(
      new Set(declared),
      "the theme declares a face token the FACES list does not name — the mail face has no token, because it is not a CSS face",
    ).toEqual(new Set(Object.values(FACES).map((face) => face.token)));
    expect(renderTheme().includes(MAIL_FACE.stack)).toBe(false);
    expect(renderTheme().includes(MAIL_FACE.wordEngineStack)).toBe(false);
  });
});
