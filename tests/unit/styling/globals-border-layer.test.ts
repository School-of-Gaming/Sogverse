import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The bug this exists to prevent shipped in the initial commit and survived
 * until 2026-09-01: `globals.css` declared the app's default border colour on
 * a universal selector, unlayered. Tailwind 4 emits every utility inside
 * `@layer utilities`, and unlayered CSS beats layered CSS regardless of
 * specificity — so `border-primary`, `border-destructive` and every
 * `border-yty-*` in the app resolved to the neutral default and drew nothing.
 *
 * Nothing looked broken, which is why it lasted: borders rendered, just always
 * in one colour, so every coloured border in the codebase was authored blind
 * and reviewed against a render that never showed it. The correct form — the
 * same declaration wrapped in `@layer base`, where it is the default a utility
 * overrides — is a one-word difference invisible to any review that is not
 * looking for it. `packages/sog-ui/docs/origins-2026-09.md` tells the story.
 *
 * So this test asserts the shape, not the text: a universal `border-color`
 * rule must exist (it is the app's default and its absence is its own bug) and
 * every one of them must sit inside an `@layer` block.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const globalsPath = join(repoRoot, "src", "app", "globals.css");

type Declaration = { property: string; selector: string; layered: boolean };

/**
 * Walks the stylesheet keeping a stack of the blocks a declaration sits in, so
 * "is this inside a layer?" is answered by the ancestry rather than by where a
 * string happens to appear. Comments are stripped first — a comment explaining
 * the rule (there is one, directly above it) must not read as the rule.
 */
function declarations(css: string): Declaration[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const stack: string[] = [];
  const found: Declaration[] = [];
  let buffer = "";

  const take = () => {
    const text = buffer.trim();
    buffer = "";
    const colon = text.indexOf(":");
    if (colon < 1 || stack.length === 0) return;
    found.push({
      property: text.slice(0, colon).trim().toLowerCase(),
      selector: stack[stack.length - 1],
      layered: stack.some((prelude) => /^@layer\b/i.test(prelude)),
    });
  };

  for (const char of source) {
    if (char === "{") {
      stack.push(buffer.trim().replace(/\s+/g, " "));
      buffer = "";
    } else if (char === "}") {
      take();
      stack.pop();
    } else if (char === ";") {
      take();
    } else {
      buffer += char;
    }
  }

  return found;
}

/** `*`, and the `*, ::before, ::after` list a reset writes it as. */
const isUniversal = (selector: string) =>
  selector
    .split(",")
    .map((part) => part.trim())
    // Deliberately one pseudo, not a repeatable group: a nested quantifier here
    // is a ReDoS shape, and `*` chained with several pseudo-elements is not a
    // selector any reset writes.
    .some((part) => part === "*" || /^\*::?[\w-]+$/.test(part));

describe("globals.css — the universal border-colour default", () => {
  const universalBorderColour = declarations(readFileSync(globalsPath, "utf8")).filter(
    ({ property, selector }) => property === "border-color" && isUniversal(selector),
  );

  it("still declares one", () => {
    expect(
      universalBorderColour.length,
      "The app's border utilities are written against a neutral default; removing it does not un-break anything, it just moves the surprise.",
    ).toBeGreaterThan(0);
  });

  it("declares every one of them inside an @layer block", () => {
    expect(
      universalBorderColour.filter(({ layered }) => !layered).map(({ selector }) => selector),
      "An unlayered universal `border-color` beats every `@layer utilities` rule Tailwind emits, silently killing every border-colour utility in the app. Wrap it in `@layer base`, where it is a default a utility can override.",
    ).toEqual([]);
  });
});
