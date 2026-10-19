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

  it.each([
    ["held in a variable", 'const Title = "h2"; const a = <Title>Words</Title>;'],
    ["held in a template literal", "const Title = `h3`; const a = <Title>Words</Title>;"],
    ["built from a level", "const Title = `h${level}`; const a = <Title>Words</Title>;"],
    ["built from a level as const", "const Title = `h${level}` as const; const a = <Title>Words</Title>;"],
    ["defaulted in a parameter", 'function Card({ as: Title = "h2" }) { return <Title>Words</Title>; }'],
    ["picked by a ternary", 'const Title = big ? "h2" : "div"; const a = <Title>Words</Title>;'],
    ["carried in an object", 'const tags = { title: "h3" };'],
  ])("reports a heading tag %s", (_how, code) => {
    expect(violations(code)).toBe(1);
  });

  it("passes strings that are not a heading tag, and a tag name used only as a key or a comparison", () => {
    expect(
      violations(
        'const a = "html"; const b = big ? "hr" : "header"; const c = { h2: "title" }; const d = level === "h2"; const e = `h${n}px`;',
      ),
    ).toBe(0);
  });
});
