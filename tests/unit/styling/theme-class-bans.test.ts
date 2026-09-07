import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import {
  noAbsentBorderColour,
  noUnregisteredColourToken,
} from "../../../eslint.config.mjs";

/**
 * **Two silent failure modes the theme merge left behind, and the guards that
 * close them.**
 *
 * Both bugs are the same shape and it is the worst shape available: the class
 * is written, the build passes, the page renders, and nothing anywhere says the
 * class did nothing. A width-only `border` paints `currentColor` now that
 * `globals.css` has no universal border-colour default; a class naming a token
 * the theme does not define — `text-primary`, which is `act`'s retired name — is
 * dropped on the floor by Tailwind 4 with no error and no warning. Neither can
 * be caught by reading the diff, because both look exactly like code that works.
 *
 * **This file exists because the rules themselves can fail the same way.** They
 * are `no-restricted-syntax` selectors carrying assembled regexes, and one of
 * them builds its allow-list by reading `theme.css` at config-load time — so a
 * mis-escaped `\b`, a path that stops resolving, or a token namespace that gets
 * renamed all produce a regex that compiles, matches nothing, and reads as a
 * rule that is holding. The palette ban shipped in exactly that state once. A
 * lint guard is worth what a deliberately-bad line proves it catches, so each
 * ban is run against one line that must be reported and one that must not.
 *
 * The pairs are chosen to pin the *reason* rather than the spelling: the
 * conforming halves are the shapes that produced the false positives while the
 * rules were being written — an arbitrary value naming a CSS property, a sided
 * width, a ring offset — so a later loosening that reintroduces one fails here.
 */

const linter = new Linter();

/** Runs one snippet through one ban, and returns how many times it fired. */
const violations = (code: string, ban: readonly unknown[]): number =>
  linter.verify(code, {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { "no-restricted-syntax": ["error", ...ban] },
  }).length;

describe("a border with no colour", () => {
  it("reports a className whose border names no edge", () => {
    expect(
      violations(
        'const a = <div className="rounded-lg border p-3" />;',
        noAbsentBorderColour,
      ),
    ).toBeGreaterThan(0);
  });

  it("passes the same className once the edge is named", () => {
    expect(
      violations(
        'const a = <div className="rounded-lg border border-border p-3" />;',
        noAbsentBorderColour,
      ),
    ).toBe(0);
  });

  it("passes a class list assembled from several literals", () => {
    // The documented scope: a `cva` base carrying the width beside a variant
    // carrying the colour is correct code, and the rule must not read one half
    // of it as a defect. This is the shape `CheckboxRow` is built in.
    expect(
      violations(
        'const v = cva("rounded-md border p-3", { variants: { checked: { true: "border-act" } } });',
        noAbsentBorderColour,
      ),
    ).toBe(0);
  });

  it("passes a bare `outline` that is a variant name rather than a class", () => {
    expect(violations('const v = { variant: "outline" };', noAbsentBorderColour)).toBe(0);
  });
});

describe("a class naming a token the theme does not define", () => {
  it("reports `text-primary`, which is the retired name of `act`", () => {
    expect(
      violations(
        'const a = <span className="text-primary" />;',
        noUnregisteredColourToken,
      ),
    ).toBeGreaterThan(0);
  });

  it("passes `text-act`", () => {
    expect(
      violations('const a = <span className="text-act" />;', noUnregisteredColourToken),
    ).toBe(0);
  });

  it("reports `bg-muted`, a fill that has never resolved", () => {
    // `--color-muted-foreground` exists and `--color-muted` does not, which is
    // exactly how this one survived review: the name reads like a token because
    // a token starts with it.
    expect(
      violations('const a = <div className="bg-muted" />;', noUnregisteredColourToken),
    ).toBeGreaterThan(0);
  });

  it("passes the sided, offset and typography spellings, and a CSS property inside an arbitrary value", () => {
    expect(
      violations(
        'const a = <div className="border-b border-border ring-offset-background text-h1 transition-[box-shadow,border-color]" />;',
        noUnregisteredColourToken,
      ),
    ).toBe(0);
  });

  it("passes a CSS declaration in an email template's markup", () => {
    expect(
      violations(
        "const style = `border-radius: 8px; text-align: center;`;",
        noUnregisteredColourToken,
      ),
    ).toBe(0);
  });
});
