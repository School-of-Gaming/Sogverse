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
 * and reviewed against a render that never showed it.
 *
 * The fix was not to layer the default but to delete it. A default border
 * colour is a safety net that lets a missing colour hide; Tailwind 4 ships
 * `currentColor` instead precisely so an unnamed edge is visibly wrong. So
 * every hidden colour utility was removed (what the owner saw is what the app
 * shows), every bordered element now names its own edge, and coloured edges
 * come back only as SOG-UI constructs.
 *
 * This test asserts the shape, not the text: neither Sogverse's stylesheet nor
 * the library's theme may declare `border-color` on a universal selector, in a
 * layer or out of one.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const globalsPath = join(repoRoot, "src", "app", "globals.css");
const themePath = join(repoRoot, "packages", "sog-ui", "src", "tokens", "theme.css");

type Declaration = { property: string; selector: string; layered: boolean };

/**
 * Walks the stylesheet keeping a stack of the blocks a declaration sits in, so
 * "is this inside a layer?" is answered by the ancestry rather than by where a
 * string happens to appear. Comments are stripped first — a comment explaining
 * the rule (there is one, where the rule used to be) must not read as the rule.
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

/**
 * `*`, and the pseudo-element lists a reset writes it as — including Tailwind's
 * own five-part preflight selector, `*, ::after, ::before, ::backdrop,
 * ::file-selector-button`, whose parts are bare pseudo-elements rather than
 * `*::before`. Either spelling reaches every box on the page, so either counts.
 */
const isUniversal = (selector: string) =>
  selector
    .split(",")
    .map((part) => part.trim())
    // Deliberately one pseudo, not a repeatable group: a nested quantifier here
    // is a ReDoS shape, and `*` chained with several pseudo-elements is not a
    // selector any reset writes. A bare pseudo-*class* (`:root`) stays out of
    // it: that selects one element, not every box.
    .some(
      (part) => part === "*" || /^\*::?[\w-]+$/.test(part) || /^::[\w-]+$/.test(part),
    );

/** The universal `border-color` rules a stylesheet declares, layered or not. */
const universalBorderColour = (css: string) =>
  declarations(css)
    .filter(({ property, selector }) => property === "border-color" && isUniversal(selector))
    .map(({ selector, layered }) => `${selector}${layered ? " (layered)" : " (unlayered)"}`);

const WHY =
  "A universal `border-color` is the safety net that hid every coloured border in this app for seven months — unlayered it beats every utility Tailwind emits, and layered it still lets an element with no colour of its own look deliberate. Delete it and name the edge on the element instead (`border-border`, or the construct that owns that edge).";

describe("no universal border-colour default", () => {
  it("src/app/globals.css declares none", () => {
    expect(universalBorderColour(readFileSync(globalsPath, "utf8")), WHY).toEqual([]);
  });

  it("packages/sog-ui/src/tokens/theme.css declares none", () => {
    expect(universalBorderColour(readFileSync(themePath, "utf8")), WHY).toEqual([]);
  });
});
