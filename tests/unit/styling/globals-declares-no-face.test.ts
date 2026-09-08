import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Sogverse's stylesheet declares no face, and sets one.
 *
 * The sibling of `globals-declares-no-colour.test.ts`, on the other half of the
 * foundations seam. @sog/ui names the faces and generates the `--font-*` tokens
 * a `font-*` utility reads; the consumer's whole part is to load the files and
 * define each face's own variable through `next/font` on `<html>`. A `--font-*`
 * declared in this stylesheet is neither of those things — it is a face
 * Sogverse decided for itself, pointed at by a token the library has no say
 * over, and it is exactly what `--font-display` was for as long as a fifth
 * family lived in the root layout.
 *
 * The second assertion is the positive half: the one `font-family` this file
 * writes is the body's, and it reads the library's own token. A second one, or
 * one naming a family, would be a face set outside the library's names — the
 * thing the lint bans in TypeScript, held here where CSS could still write it.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const globalsPath = join(repoRoot, "src", "app", "globals.css");

/**
 * The stylesheet with its comments stripped, which is the only form either
 * assertion may read: the file explains at length which face token left it and
 * why, naming it, and an explanation of a deleted token must not read as the
 * token. Same reason, same treatment, as the colour test's parser.
 */
const source = readFileSync(globalsPath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * A declaration starts a statement, so it is preceded by a brace, a semicolon or
 * the start of the file; a `var(--font-sans)` inside a value is preceded by `(`
 * and is a *use*, which is what the body rule below is and must stay allowed to
 * be.
 */
const declaredFaceTokens = [
  ...source.matchAll(/(?:^|[;{}])\s*(--font-[\w-]+)\s*:/g),
].map((match) => match[1]);

/** Every `font-family` declaration in the file, as its value. */
const fontFamilyValues = [
  ...source.matchAll(/font-family\s*:\s*([^;}]+)/g),
].map((match) => match[1].trim());

const WHY =
  "src/app/globals.css declares no face. @sog/ui names the faces and generates the --font-* tokens a font-* utility reads; this app's only part is to load the files and define each face's own variable through next/font on <html>. A --font-* declared here is a face Sogverse defined for itself — see packages/sog-ui/src/tokens/typography.ts.";

describe("Sogverse's stylesheet declares no face", () => {
  it("declares no --font-* custom property", () => {
    expect(declaredFaceTokens, WHY).toEqual([]);
  });

  it("sets exactly one font-family, and it is the library's app-face token", () => {
    expect(
      fontFamilyValues,
      "src/app/globals.css sets the app face once, on the body, from @sog/ui's own token. A second font-family here — or one naming a family — is a face set outside the library's names.",
    ).toEqual(["var(--font-sans)"]);
  });
});
