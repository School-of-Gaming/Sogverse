import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Sogverse's stylesheet declares no colour, and the list of what it may declare
 * is exhaustive.
 *
 * This is the theme adoption's boundary test, written as a mechanism. Before it,
 * `globals.css` held the whole palette — grounds, ink, the signature pair, the
 * status set, the Yty families, the sixteen picks — and a new visual identity
 * for School of Gaming meant editing this app. It now imports @sog/ui's
 * generated theme and keeps only the tokens the library does not own yet, which
 * is what makes "the look changed and only the library moved" a fact rather than
 * an aspiration.
 *
 * So the test is not "no `--color-*`" — that phrasing invites the next colour to
 * arrive under a name that dodges it (`--brand-amber`, `--surface-2`). It
 * enumerates the whole set instead: two layout heights and the radius scale.
 * Anything else declared here fails, and the failure is the question "which
 * adoption owns this, and why is it here instead of there?" The face half of
 * the same seam is this file's sibling, `globals-declares-no-face.test.ts`: no
 * `--font-*` is declared here at all, because the faces are the library's and
 * the variables behind them are next/font's.
 *
 * Adding to the allowed set is a deliberate act. A token that genuinely belongs
 * to Sogverse rather than to the brand — a measured layout value, something the
 * library has no opinion about — goes in the list with the reason it is not the
 * library's. A colour never does.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const globalsPath = join(repoRoot, "src", "app", "globals.css");

/**
 * Every custom property the stylesheet *declares*, wherever it declares it.
 *
 * A declaration starts a statement, so it is preceded by a brace, a semicolon or
 * the start of the file; a `var(--color-background)` inside a value is preceded
 * by `(` and is a use, not a declaration. That distinction is the whole of the
 * parsing, and it is why this is a regex rather than a CSS parser: the file uses
 * the tokens it receives from the library all over its body rules, and reading
 * those as declarations would make the test fail on the very thing it wants.
 *
 * Comments are stripped first — the file explains at length which tokens left it
 * and why, naming them, and an explanation of a deleted token must not read as
 * the token.
 */
const declaredCustomProperties = (css: string): string[] => {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return [...source.matchAll(/(?:^|[;{}])\s*(--[\w-]+)\s*:/g)].map(
    (match) => match[1],
  );
};

/**
 * What `src/app/globals.css` is allowed to declare, and why each one is not the
 * library's yet. Every entry is a line item in the adoption backlog: the day
 * @sog/ui owns the spacing and radius scales, the radius entries leave this list
 * in the same change that deletes them from the stylesheet.
 */
const ALLOWED = {
  // The sticky header's height, read by the header, the dashboard sidebar's
  // sticky offset, the home hero's bleed and every hash-anchor scroll margin.
  // Layout, not colour; it belongs to the library the day chrome is adopted.
  "--header-height": "layout: the sticky header's height",
  // The measured height of the product page's sticky signup rail, written by a
  // ResizeObserver. CSS cannot measure a box, so this is a number JS supplies —
  // the one value here that is not authored at all.
  "--signup-rail-height": "layout: a measured height JS writes",
  // The corner radius as one base step and the four utilities derived from it.
  // A radius arrives in the library with its first cornered component, which is
  // the Button adoption; until then the scale lives here.
  "--radius": "the radius scale, pending the Button adoption",
  "--radius-sm": "the radius scale, pending the Button adoption",
  "--radius-md": "the radius scale, pending the Button adoption",
  "--radius-lg": "the radius scale, pending the Button adoption",
  "--radius-xl": "the radius scale, pending the Button adoption",
} as const;

const WHY =
  "src/app/globals.css declares only layout values and the radius scale. Every colour in this app comes from @sog/ui's generated theme — a token declared here is a colour (or a scale) the library cannot govern, and it is what made a brand change mean editing this app. Move it into the package, or add it to ALLOWED with the reason it is not the library's.";

describe("Sogverse's stylesheet declares no colour", () => {
  const declared = declaredCustomProperties(readFileSync(globalsPath, "utf8"));

  it("declares exactly the tokens the library does not own yet", () => {
    expect([...declared].sort(), WHY).toEqual(Object.keys(ALLOWED).sort());
  });

  it("declares no colour token under any name", () => {
    // The narrower claim, stated separately so a failure says which of the two
    // rules broke: the enumeration above catches a colour arriving under a
    // disguised name, and this catches the obvious spelling with a message that
    // names the problem outright.
    expect(
      declared.filter((name) => /colou?r|^--(bg|fg|ink|surface|brand)\b/i.test(name)),
      WHY,
    ).toEqual([]);
  });
});
