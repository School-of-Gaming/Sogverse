import { createRef } from "react";
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
type Options = {
  align?: "start" | "center" | "center-narrow";
  truncate?: boolean;
  focusTarget?: boolean;
  lang?: string;
};

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
  // A class naming a size the theme does not declare compiles to nothing and
  // the heading silently inherits the body size, so each step's utility is
  // held to the sizes the generator emits.
  it.each(PAIRS.map((pair) => [`h${pair.level}`, pair.step, pair] as const))(
    "renders an %s and sets the %s step only through sizes the theme declares",
    (tag, _step, pair) => {
      const element = headingOf(pair);
      expect(element.tagName.toLowerCase()).toBe(tag);
      const sizes = sizeClasses(element);
      expect(sizes.length).toBeGreaterThan(0);
      for (const size of sizes) expect(DECLARED_SIZES).toContain(size);
    },
  );

  it("resteps the story steps alone, from their narrow size to their own at md", () => {
    for (const pair of PAIRS) {
      const classes = [...headingOf(pair).classList];
      const responsive = classes.filter((name) => name.includes(":"));
      const story = pair.step === "hero" || pair.step === "display";
      expect(responsive).toEqual(story ? [`md:text-${pair.step}`] : []);
      if (story) expect(classes).toContain(`text-${pair.step}-mobile`);
    }
  });

  it("balances its lines, except where it is held to one", () => {
    const pair = { level: 3, step: "card-title" } as const;
    expect(headingOf(pair).classList).toContain("text-balance");
    const truncated = headingOf(pair, { truncate: true }).classList;
    expect(truncated).toContain("truncate");
    expect(truncated).not.toContain("text-balance");
  });

  it("centres below md and starts from md when asked to follow a stacking composition", () => {
    const classes = [...headingOf({ level: 1, step: "hero" }, { align: "center-narrow" }).classList];
    expect(classes).toContain("text-center");
    expect(classes).toContain("md:text-start");
    expect(classes).not.toContain("text-start");
  });

  it("takes focus from script without becoming a tab stop", () => {
    const ref = createRef<HTMLHeadingElement>();
    render(
      <Heading level={1} step="page-title" ref={ref} focusTarget>
        Words
      </Heading>,
    );
    const element = ref.current;
    if (element === null) throw new Error("the ref was not attached");
    expect(element.tabIndex).toBe(-1);
    element.focus();
    expect(document.activeElement).toBe(element);
    expect(headingOf({ level: 2, step: "section" }).hasAttribute("tabindex")).toBe(false);
  });

  it("marks the words' language on the element", () => {
    const pair = { level: 2, step: "card-title" } as const;
    expect(headingOf(pair, { lang: "fi" }).getAttribute("lang")).toBe("fi");
    expect(headingOf(pair).hasAttribute("lang")).toBe(false);
  });
});

/**
 * The table, as the compiler holds it. Each line is a pair outside the table,
 * and the build fails if it ever compiles — which is what "an unlisted pair
 * does not compile" means. Never rendered: the type-check is the assertion.
 */
export const DISALLOWED_PAIRS = () => [
  // @ts-expect-error -- the hero titles a page, which is h1's alone
  <Heading key="2-hero" level={2} step="hero">Words</Heading>,
  // @ts-expect-error -- page-title titles a page, which is h1's alone
  <Heading key="2-page-title" level={2} step="page-title">Words</Heading>,
  // @ts-expect-error -- display titles a story section, which is h2's alone
  <Heading key="1-display" level={1} step="display">Words</Heading>,
  // @ts-expect-error -- display titles a story section, which is h2's alone; it is above h3's ceiling too
  <Heading key="3-display" level={3} step="display">Words</Heading>,
  // @ts-expect-error -- page-title titles a page, which is h1's alone; it is above h3's ceiling too
  <Heading key="3-page-title" level={3} step="page-title">Words</Heading>,
  // @ts-expect-error -- the hero titles a page, which is h1's alone; it is above h3's ceiling too
  <Heading key="3-hero" level={3} step="hero">Words</Heading>,
  // @ts-expect-error -- above h4's ceiling: an h4 sits inside a card or a sub-section
  <Heading key="4-section" level={4} step="section">Words</Heading>,
  // @ts-expect-error -- the outline stops at h4
  <Heading key="5-label" level={5} step="label">Words</Heading>,
];
