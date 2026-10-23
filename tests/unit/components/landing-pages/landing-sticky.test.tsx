import { afterAll, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "@/../messages/en/common.json";
import landingSubscribe from "@/../messages/en/landingSubscribe.json";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import type {
  LandingSection,
  LandingSectionBackground,
  LandingSectionTexts,
  LandingStickySide,
} from "@/lib/landing-pages/sections";
import { NO_UTM_ATTRIBUTION } from "@/lib/utm";
import { UtmProvider } from "@/providers";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
afterAll(() => vi.unstubAllEnvs());

/**
 * **A page's sticky sections, as the body draws them.** jsdom has no layout,
 * so what is pinned is the markup the layout follows: each sticky section
 * drawn once, after every other section and in the structure's order, in the
 * gutter on the side the structure names, sticky from `2xl`; every other
 * section in the grid's content track, never padded for a card, a band
 * spanning every track; and the page grid flooring exactly the gutters that
 * hold a card. Where the cards actually sit at each width was measured in a
 * real browser.
 */

const messages = { common, landingSubscribe };

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HERO = id(1);
const FORM = id(2);
const FAQ = id(3);
const CTA = id(4);
const DATES = id(5);

/**
 * The structure: the form sticky on the first side named, a second sign-up
 * sticky on the second side named (after the FAQ, so the two are apart in the
 * structure), or the form in the flow when none is.
 */
function structure(
  sides: readonly LandingStickySide[],
  background: LandingSectionBackground = "default",
  lastBackground: LandingSectionBackground = "default",
): LandingSection[] {
  const first = sides.at(0);
  const second = sides.at(1);
  return [
    { id: HERO, type: "hero", button: { kind: "internal", path: "/shop" } },
    first === undefined
      ? { id: FORM, type: "subscribe", background }
      : { id: FORM, type: "subscribe", background, sticky: first },
    { id: FAQ, type: "faq", background, items: [{ id: id(10) }] },
    ...(second === undefined
      ? []
      : [{ id: DATES, type: "subscribe" as const, background, sticky: second }]),
    { id: CTA, type: "cta", background: lastBackground, button: { kind: "internal", path: "/shop" } },
  ];
}

const TEXTS: LandingSectionTexts = {
  [HERO]: { headline: "Gaming clubs in Espoo", buttonLabel: "Find a club" },
  [FORM]: { heading: "Hear about new clubs first", buttonLabel: "Keep me posted" },
  [FAQ]: { heading: "Questions", items: { [id(10)]: { question: "Who?", answer: "Us." } } },
  [DATES]: { heading: "Get the term dates", buttonLabel: "Send them" },
  [CTA]: { heading: "Ready?", buttonLabel: "Join" },
};

function renderBody({
  sides = ["right"],
  background = "default",
  lastBackground = "default",
  breadcrumb,
}: {
  sides?: readonly LandingStickySide[];
  background?: LandingSectionBackground;
  lastBackground?: LandingSectionBackground;
  breadcrumb?: ReactNode;
} = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <UtmProvider initialUtm={NO_UTM_ATTRIBUTION}>
        <LandingPageBody
          sections={structure(sides, background, lastBackground)}
          pictures={{}}
          testimonials={{}}
          guideIds={[]}
          sectionTexts={TEXTS}
          textLocale="en"
          locale="en"
          products={null}
          pageId={id(500)}
          preview={false}
          breadcrumb={breadcrumb}
        />
      </UtmProvider>
    </NextIntlClientProvider>,
  );
}

/** The holder of the sticky card whose heading this is. */
function railOf(heading: string): HTMLElement {
  const rail = screen.getByRole("heading", { name: heading }).closest<HTMLElement>(
    '[class*="2xl:sticky"]',
  );
  if (rail === null) throw new Error(`no rail around ${heading}`);
  return rail;
}

/** The page grid's three tracks, as its `2xl` template states them. */
function tracks(className: string | undefined): string[] {
  return /2xl:grid-cols-\[(.*?)\](?:\s|$)/.exec(className ?? "")?.[1].split("_") ?? [];
}

const FLOOR = "var(--landing-rail-width)";

describe("a page's sticky section", () => {
  it("is drawn once, after every other section, its heading an H2 in reading order", () => {
    renderBody();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Questions",
      "Ready?",
      "Hear about new clubs first",
    ]);
    expect(screen.getAllByRole("heading", { name: "Hear about new clubs first" })).toHaveLength(1);
  });

  it("stands in the gutter on the side the structure names, sticky from 2xl", () => {
    for (const side of ["right", "left"] as const) {
      const { unmount } = renderBody({ sides: [side] });
      const rail = railOf("Hear about new clubs first");
      expect(rail.className).toContain("2xl:w-[var(--landing-rail-width)]");
      // Pinned against the content: a left card pushed to its gutter's inner edge.
      if (side === "left") expect(rail.className).toContain("2xl:ml-auto");
      else expect(rail.className).not.toContain("ml-auto");
      expect(rail.parentElement?.className).toContain(
        side === "right" ? "2xl:col-start-3" : "2xl:col-start-1",
      );
      // The page's grid keeps the card's floor on its side and lets the other gutter close.
      const [first, , last] = tracks(rail.parentElement?.parentElement?.className);
      const [floored, open] = side === "left" ? [first, last] : [last, first];
      expect(floored).toContain(FLOOR);
      expect(open).not.toContain(FLOOR);
      unmount();
    }
  });

  it("never narrows or pads a section for the card: each sits in the content track of its own row", () => {
    renderBody();
    for (const name of ["Gaming clubs in Espoo", "Questions", "Ready?"]) {
      const section = screen.getByRole("heading", { name }).closest("section");
      expect(section?.className).toContain("container mx-auto px-4");
      expect(section?.parentElement?.className).toContain("2xl:grid-cols-subgrid");
      expect(section?.parentElement?.className).toContain("2xl:*:col-start-2");
    }
  });

  it("runs a card band across every track, the section inside it in the content one, and never bands the sticky card", () => {
    renderBody({ background: "card" });
    const faq = screen.getByRole("heading", { name: "Questions" }).closest("section");
    // The band is the full-width row; the section inside it is the content box.
    const band = faq?.parentElement?.className;
    expect(band).toContain("bg-card");
    expect(band).toContain("2xl:col-span-full");
    expect(band).toContain("2xl:grid-cols-subgrid");
    expect(band).not.toContain("container");
    // The sticky section's own background is not drawn: it stands on the page as a card.
    const form = screen.getByRole("heading", { name: "Hear about new clubs first" }).closest("section");
    expect(form?.parentElement).toBe(railOf("Hear about new clubs first"));
  });

  it("keeps a section's spacing above the card below 2xl when the last section is a band", () => {
    const layer = () => railOf("Hear about new clubs first").parentElement?.className;
    // The FAQ is banded, but the CTA after it is not: the CTA's own spacing is the gap.
    const { unmount } = renderBody({ background: "card" });
    expect(layer()).not.toMatch(/(?:^|\s)pt-16(?:\s|$)/);
    expect(layer()).toContain("2xl:pt-24");
    unmount();
    // The last section a band: its spacing is inside the band, so the layer brings its own.
    renderBody({ background: "card", lastBackground: "card" });
    expect(layer()).toMatch(/(?:^|\s)pt-16 sm:pt-24(?:\s|$)/);
    expect(layer()).toContain("2xl:pt-24");
  });

  it("stacks the form's name fields in the column, which is narrower than the viewport says", () => {
    /** The grid holding the first and last name, as the form draws it. */
    const nameRow = () =>
      document.querySelector('input[autocomplete="given-name"]')?.closest(".grid")?.className;
    const { unmount } = renderBody();
    expect(nameRow()).toBeDefined();
    expect(nameRow()).not.toContain("grid-cols-2");
    unmount();
    renderBody({ sides: [] });
    expect(nameRow()).toContain("sm:grid-cols-2");
  });

  it("draws nothing under the hero but the hero's own content", () => {
    renderBody();
    const hero = screen.getByRole("heading", { level: 1 }).closest("section");
    const controls = [...(hero?.querySelectorAll("a, button") ?? [])];
    expect(controls.map((element) => element.textContent)).toEqual(["Find a club"]);
  });

  it("draws the breadcrumb as the page grid's first row, in the content track, outside the text's lang", () => {
    const crumb = <nav aria-label="Breadcrumb">Discover</nav>;
    const { unmount } = renderBody({ breadcrumb: crumb });
    const row = screen.getByRole("navigation", { name: "Breadcrumb" }).parentElement;
    expect(row?.className).toContain("2xl:row-start-1");
    expect(row?.className).toContain("2xl:grid-cols-subgrid");
    expect(row?.className).toContain("2xl:*:col-start-2");
    expect(row?.parentElement).toBe(
      railOf("Hear about new clubs first").parentElement?.parentElement,
    );
    unmount();
    // No sticky section: the breadcrumb stands on its own before the body, as it always has.
    const { container } = renderBody({ sides: [], breadcrumb: crumb });
    expect(container.firstElementChild?.tagName).toBe("NAV");
  });

  it("is an ordinary section, with no column, on a page that marks none", () => {
    renderBody({ sides: [] });
    expect(document.querySelector('[class*="2xl:sticky"]')).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Hear about new clubs first",
      "Questions",
      "Ready?",
    ]);
  });
});

describe("a sticky section on each side", () => {
  it("draws both after every other section, in the structure's order", () => {
    renderBody({ sides: ["right", "left"] });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Questions",
      "Ready?",
      "Hear about new clubs first",
      "Get the term dates",
    ]);
  });

  it("stands each card in its own gutter, in the sections' row, and floors both gutters", () => {
    renderBody({ sides: ["right", "left"] });
    const right = railOf("Hear about new clubs first");
    const left = railOf("Get the term dates");
    expect(right.parentElement?.className).toContain("2xl:col-start-3");
    expect(left.parentElement?.className).toContain("2xl:col-start-1");
    for (const rail of [right, left]) {
      expect(rail.parentElement?.className).toContain("2xl:row-start-2");
      expect(rail.className).toContain("2xl:sticky");
      // Each clamps by the height it publishes on itself.
      expect(rail.className).toContain("var(--landing-rail-height)");
    }
    expect(left.className).toContain("2xl:ml-auto");
    expect(right.className).not.toContain("ml-auto");
    // One grid holds both, the content between two floored gutters.
    const page = right.parentElement?.parentElement;
    expect(left.parentElement?.parentElement).toBe(page);
    const [first, content, last] = tracks(page?.className);
    expect(first).toContain(FLOOR);
    expect(last).toContain(FLOOR);
    expect(content).toBe("minmax(0,74rem)");
  });

  it("brings a band's spacing above the first card only, the first card's own spacing being the gap above the second", () => {
    renderBody({ sides: ["left", "right"], background: "card", lastBackground: "card" });
    const first = railOf("Hear about new clubs first").parentElement?.className;
    const second = railOf("Get the term dates").parentElement?.className;
    expect(first).toMatch(/(?:^|\s)pt-16 sm:pt-24(?:\s|$)/);
    expect(second).not.toMatch(/(?:^|\s)pt-16(?:\s|$)/);
    for (const layer of [first, second]) expect(layer).toContain("pb-16 sm:pb-24");
  });
});
