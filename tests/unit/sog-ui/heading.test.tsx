import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  HEADING_STEPS,
  Heading,
  type HeadingPair,
} from "../../../packages/sog-ui/src/components/heading";
import { typeSizes } from "../../../packages/sog-ui/src/tokens/typography";

/**
 * The heading primitive: the outline level it renders, the step it wears, and
 * the table of pairs its types allow.
 *
 * Every pair is drawn from the table rather than listed, so a pair the table
 * gains is rendered here without editing this file.
 */

const PAIRS: readonly HeadingPair[] = [
  ...HEADING_STEPS[1].map((step) => ({ level: 1, step }) as const),
  ...HEADING_STEPS[2].map((step) => ({ level: 2, step }) as const),
  ...HEADING_STEPS[3].map((step) => ({ level: 3, step }) as const),
  ...HEADING_STEPS[4].map((step) => ({ level: 4, step }) as const),
];

/** Every `text-*` size the theme declares, which is every size class that compiles to something. */
const DECLARED_SIZES = new Set(
  typeSizes().map(({ cssName }) => `text-${cssName.slice("--text-".length)}`),
);

/** The props a case varies beside the pair. */
type Options = { align?: "start" | "center"; truncate?: boolean; srOnly?: boolean };

function headingOf(pair: HeadingPair, extra: Options = {}) {
  const { container } = render(
    <Heading {...pair} {...extra}>
      Words
    </Heading>,
  );
  const element = container.firstElementChild;
  if (!(element instanceof HTMLElement)) throw new Error("Heading rendered nothing");
  return element;
}

/** The non-size `text-*` utilities a heading writes: its ink, its alignments, its wrapping. */
const NOT_A_SIZE = new Set(["text-foreground", "text-start", "text-center", "text-balance"]);

/** The size classes on an element, variants stripped (`md:text-hero` → `text-hero`). */
function sizeClasses(element: HTMLElement): string[] {
  return [...element.classList]
    .map((name) => name.slice(name.lastIndexOf(":") + 1))
    .filter((name) => name.startsWith("text-") && !NOT_A_SIZE.has(name));
}

describe("Heading", () => {
  it.each(PAIRS.map((pair) => [`h${pair.level}`, pair.step, pair] as const))(
    "renders an %s wearing the %s step",
    (tag, step, pair) => {
      const element = headingOf(pair);
      expect(element.tagName.toLowerCase()).toBe(tag);
      expect(element.classList).toContain(
        step === "hero" ? "text-hero-mobile" : `text-${step}`,
      );
    },
  );

  // A class naming a size the theme does not declare compiles to nothing and
  // the heading silently inherits the body size, so each step's utility is
  // held to the sizes the generator emits.
  it.each(PAIRS.map((pair) => [pair.step, pair] as const))(
    "sets the %s step only through sizes the theme declares",
    (_step, pair) => {
      const sizes = sizeClasses(headingOf(pair));
      expect(sizes.length).toBeGreaterThan(0);
      for (const size of sizes) expect(DECLARED_SIZES).toContain(size);
    },
  );

  it("resteps the hero alone, from its narrow size to its own at md", () => {
    for (const pair of PAIRS) {
      const classes = [...headingOf(pair).classList];
      const responsive = classes.filter((name) => name.includes(":"));
      expect(responsive).toEqual(pair.step === "hero" ? ["md:text-hero"] : []);
    }
  });

  it("balances its lines, except where it is held to one", () => {
    const pair = { level: 3, step: "card-title" } as const;
    expect(headingOf(pair).classList).toContain("text-balance");
    const truncated = headingOf(pair, { truncate: true }).classList;
    expect(truncated).toContain("truncate");
    expect(truncated).not.toContain("text-balance");
  });

  it("states its alignment rather than inheriting one", () => {
    const pair = { level: 2, step: "section" } as const;
    expect(headingOf(pair).classList).toContain("text-start");
    expect(headingOf(pair, { align: "center" }).classList).toContain("text-center");
  });

  it("stays in the outline when visually hidden", () => {
    const element = headingOf({ level: 2, step: "section" }, { srOnly: true });
    expect(element.tagName.toLowerCase()).toBe("h2");
    expect(element.classList).toContain("sr-only");
  });
});

/**
 * The table, as the compiler holds it. Each line is a pair outside the table,
 * and the build fails if it ever compiles — which is what "an unlisted pair
 * does not compile" means. Never rendered: the type-check is the assertion.
 */
export const DISALLOWED_PAIRS = () => [
  // @ts-expect-error -- the hero is a page's own title, never a section's
  <Heading key="2-hero" level={2} step="hero">Words</Heading>,
  // @ts-expect-error -- display is a story section's step, never a page title
  <Heading key="1-display" level={1} step="display">Words</Heading>,
  // @ts-expect-error -- an app page's title is h1 alone
  <Heading key="2-page-title" level={2} step="page-title">Words</Heading>,
  // @ts-expect-error -- a whole page is never titled in 24px
  <Heading key="1-section" level={1} step="section">Words</Heading>,
  // @ts-expect-error -- label never reaches the top of a page's regions
  <Heading key="2-label" level={2} step="label">Words</Heading>,
  // @ts-expect-error -- an h4 cannot claim a section's rank
  <Heading key="4-section" level={4} step="section">Words</Heading>,
  // @ts-expect-error -- the outline stops at h4
  <Heading key="5-label" level={5} step="label">Words</Heading>,
];
