import { Linter } from "eslint";
import { describe, expect, it } from "vitest";

import { noRawHeadingElements } from "../../../eslint.config.mjs";

/**
 * The ban on a raw heading element in Sogverse. A selector that compiles and
 * matches nothing reads exactly like one that holds, so a violating line and a
 * conforming one go through it.
 */

const linter = new Linter();

const violations = (code: string): number =>
  linter.verify(code, {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { "no-restricted-syntax": ["error", ...noRawHeadingElements] },
  }).length;

describe("the raw heading ban", () => {
  it.each(["h1", "h2", "h3", "h4", "h5", "h6"])("reports a raw %s", (tag) => {
    expect(violations(`const a = <${tag} className="x">Words</${tag}>;`)).toBe(1);
  });

  it("passes the primitive, and elements whose names only start like a heading", () => {
    expect(
      violations(
        'const a = <><Heading level={1} step="page-title">Words</Heading><hr /><header /></>;',
      ),
    ).toBe(0);
  });

  it("passes a heading built from a tag name, which is not JSX", () => {
    expect(violations('const a = createElement("h2", null, "Words");')).toBe(0);
  });
});
