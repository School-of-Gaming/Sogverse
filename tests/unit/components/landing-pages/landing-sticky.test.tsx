import { afterAll, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "@/../messages/en/common.json";
import landingPage from "@/../messages/en/landingPage.json";
import landingSubscribe from "@/../messages/en/landingSubscribe.json";
import richText from "@/../messages/en/richText.json";
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

/** The reader a guide's download is drawn for: signed out unless a test signs one in. */
const mockAuth = vi.fn(() => ({ user: null as { id: string } | null }));
vi.mock("@/providers/auth-provider", () => ({ useAuth: () => mockAuth() }));

/**
 * **A page's sticky sections, as the body draws them.** jsdom has no layout
 * and no media queries, so what is pinned is the markup the layout follows:
 * each sticky section drawn once, at its place in the structure; below `2xl`
 * nothing but what the same section without `sticky` carries — its band on a
 * `card` background, its type's own classes — and every class that makes it
 * the gutter's sticky card written `2xl:`; the sections in the flow placed in
 * the sections' grid rows, which a sticky section spans; and the page grid
 * flooring exactly the gutters that hold a card. Where the cards actually sit
 * at each width was measured in a real browser.
 */

const messages = { common, landingPage, landingSubscribe, richText };

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
  stickyBackground: LandingSectionBackground = "default",
): LandingSection[] {
  const first = sides.at(0);
  const second = sides.at(1);
  return [
    { id: HERO, type: "hero", button: { kind: "internal", path: "/shop" } },
    first === undefined
      ? { id: FORM, type: "subscribe", background: stickyBackground }
      : { id: FORM, type: "subscribe", background: stickyBackground, sticky: first },
    { id: FAQ, type: "faq", background, items: [{ id: id(10) }] },
    ...(second === undefined
      ? []
      : [{ id: DATES, type: "subscribe" as const, background: stickyBackground, sticky: second }]),
    { id: CTA, type: "cta", background, button: { kind: "internal", path: "/shop" } },
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
  stickyBackground = "default",
  breadcrumb,
}: {
  sides?: readonly LandingStickySide[];
  background?: LandingSectionBackground;
  stickyBackground?: LandingSectionBackground;
  breadcrumb?: ReactNode;
} = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <UtmProvider initialUtm={NO_UTM_ATTRIBUTION}>
        <LandingPageBody
          sections={structure(sides, background, stickyBackground)}
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

/** The holder of the sticky section whose heading this is. */
function railOf(heading: string): HTMLElement {
  const rail = screen.getByRole("heading", { name: heading }).closest<HTMLElement>(
    '[class*="2xl:sticky"]',
  );
  if (rail === null) throw new Error(`no rail around ${heading}`);
  return rail;
}

/** The layer around a sticky section: its row below `2xl`, its gutter from there. */
function layerOf(heading: string): HTMLElement {
  const layer = railOf(heading).parentElement;
  if (layer === null) throw new Error(`no layer around ${heading}`);
  return layer;
}

/** The row of the sections' grid a section in the flow is drawn in. */
function rowOf(heading: string): HTMLElement {
  const row = screen.getByRole("heading", { name: heading }).closest("section")?.parentElement;
  if (row === null || row === undefined) throw new Error(`no row around ${heading}`);
  return row;
}

/** The classes on an element that apply below `2xl`: every one with no breakpoint at or above it. */
function below2xl(element: Element): string[] {
  return [...element.classList].filter((name) => !name.startsWith("2xl:"));
}

/** The page grid's three tracks, as its `2xl` template states them. */
function tracks(className: string | undefined): string[] {
  return /2xl:grid-cols-\[(.*?)\](?:\s|$)/.exec(className ?? "")?.[1].split("_") ?? [];
}

const FLOOR = "var(--landing-rail-width)";

describe("a page's sticky section", () => {
  it("is drawn once, at its place in the structure, its heading an H2 in reading order", () => {
    renderBody();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Hear about new clubs first",
      "Questions",
      "Ready?",
    ]);
    expect(screen.getAllByRole("heading", { name: "Hear about new clubs first" })).toHaveLength(1);
    expect(document.querySelectorAll("form")).toHaveLength(1);
  });

  it("is, below 2xl, the same section without sticky: in the flow, on its own background", () => {
    for (const stickyBackground of ["default", "card"] as const) {
      const { unmount } = renderBody({ stickyBackground });
      const layer = layerOf("Hear about new clubs first");
      // Its row carries its band and nothing else below 2xl, and the rail none.
      expect(below2xl(layer)).toEqual(stickyBackground === "card" ? ["bg-card"] : []);
      expect(below2xl(railOf("Hear about new clubs first"))).toEqual([]);
      // The section keeps a section's container and spacing, which go only from 2xl.
      const section = layer.querySelector("section");
      expect(section?.className).toContain("container mx-auto px-4 py-16 sm:py-24");
      expect(section?.className).toContain("2xl:p-0");
      // The card frame draws no box below 2xl.
      const frame = layer.querySelector("[data-sticky-card]");
      expect(frame?.className).toContain("max-2xl:contents");
      unmount();
    }
  });

  it("stands in the gutter on the side the structure names from 2xl, sticky, its band not drawn", () => {
    for (const side of ["right", "left"] as const) {
      const { unmount } = renderBody({ sides: [side], stickyBackground: "card" });
      const rail = railOf("Hear about new clubs first");
      expect(rail.className).toContain("2xl:sticky");
      expect(rail.className).toContain("2xl:w-[var(--landing-rail-width)]");
      // Pinned against the content: a left card pushed to its gutter's inner edge.
      if (side === "left") expect(rail.className).toContain("2xl:ml-auto");
      else expect(rail.className).not.toContain("ml-auto");
      const layer = layerOf("Hear about new clubs first");
      expect(layer.className).toContain(side === "right" ? "2xl:col-start-3" : "2xl:col-start-1");
      expect(layer.className).toContain("2xl:bg-transparent");
      // It spans every row the sections in the flow take: hero, FAQ, CTA.
      expect(layer.style.gridRow).toBe("1 / span 3");
      // The page's grid keeps the card's floor on its side and lets the other gutter close.
      const [first, , last] = tracks(layer.parentElement?.parentElement?.className);
      const [floored, open] = side === "left" ? [first, last] : [last, first];
      expect(floored).toContain(FLOOR);
      expect(open).not.toContain(FLOOR);
      unmount();
    }
  });

  it("places every section in the flow in its own row, closing up around the sticky one", () => {
    renderBody({ background: "card" });
    expect(
      ["Gaming clubs in Espoo", "Questions", "Ready?"].map((name) => rowOf(name).style.gridRow),
    ).toEqual(["1", "2", "3"]);
    // All in one grid, the sticky section among them where the structure puts it.
    const grid = rowOf("Questions").parentElement;
    expect(layerOf("Hear about new clubs first").parentElement).toBe(grid);
    expect([...(grid?.children ?? [])].indexOf(layerOf("Hear about new clubs first"))).toBe(1);
  });

  it("never narrows or pads a section for the card: each sits in the content track of its own row", () => {
    renderBody();
    for (const name of ["Gaming clubs in Espoo", "Questions", "Ready?"]) {
      expect(rowOf(name).className).toContain("2xl:grid-cols-subgrid");
      expect(rowOf(name).className).toContain("2xl:*:col-start-2");
    }
  });

  it("runs a card band across every track, the section inside it in the content one", () => {
    renderBody({ background: "card" });
    const band = rowOf("Questions").className;
    expect(band).toContain("bg-card");
    expect(band).toContain("2xl:col-span-full");
    expect(band).toContain("2xl:grid-cols-subgrid");
    expect(band).not.toContain("container");
  });

  it("leaves a section that draws nothing out of the rows the sticky one spans", () => {
    const QUOTES = id(31);
    const PICKS = id(32);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <UtmProvider initialUtm={NO_UTM_ATTRIBUTION}>
          <LandingPageBody
            sections={[
              { id: HERO, type: "hero" },
              { id: FAQ, type: "faq", background: "card", items: [{ id: id(10) }] },
              { id: QUOTES, type: "testimonials", background: "default", arrangement: "feature", testimonialIds: [id(40)] },
              { id: PICKS, type: "products", background: "default", productIds: [id(41)] },
              { id: FORM, type: "subscribe", background: "default", sticky: "right" },
            ]}
            pictures={{}}
            testimonials={{}}
            guideIds={[]}
            sectionTexts={{
              ...TEXTS,
              [QUOTES]: { heading: "What parents say" },
              [PICKS]: { heading: "Pick a club" },
            }}
            textLocale="en"
            locale="en"
            products={{ listing: [], counts: [] }}
            pageId={id(500)}
            preview={false}
          />
        </UtmProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("heading", { name: "What parents say" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Pick a club" })).toBeNull();
    // Neither leaves a row of the grid behind: the FAQ's row is followed by the sticky section.
    expect(rowOf("Questions").nextElementSibling).toBe(layerOf("Hear about new clubs first"));
    expect(layerOf("Hear about new clubs first").style.gridRow).toBe("1 / span 2");
  });

  it("pairs the form's name fields from sm in the flow and stacks them in the card from 2xl", () => {
    /** The grid holding the first and last name, as the form draws it. */
    const nameRow = () => document.querySelector('input[autocomplete="given-name"]')?.closest(".grid");
    const { unmount } = renderBody();
    expect(nameRow()?.className).toContain("sm:grid-cols-2");
    expect(nameRow()?.className).toContain("2xl:grid-cols-1");
    const submit = screen.getByRole("button", { name: /Keep me posted/ });
    expect(submit.className).toContain("sm:w-auto");
    expect(submit.className).toContain("2xl:w-full");
    unmount();
    renderBody({ sides: [] });
    expect(nameRow()?.className).toContain("sm:grid-cols-2");
    expect(nameRow()?.className).not.toContain("2xl:grid-cols-1");
  });

  it("draws the header start-aligned under the card's heading from 2xl, centred in the flow", () => {
    renderBody();
    const heading = screen.getByRole("heading", { name: "Hear about new clubs first" });
    const header = heading.parentElement?.parentElement;
    expect(header?.className).toContain("text-center");
    expect(header?.className).toContain("2xl:text-start 2xl:[&_h2]:text-card-title");
  });

  it("draws the breadcrumb as the page grid's first row, in the content track, outside the text's lang", () => {
    const crumb = <nav aria-label="Breadcrumb">Discover</nav>;
    const { unmount } = renderBody({ breadcrumb: crumb });
    const row = screen.getByRole("navigation", { name: "Breadcrumb" }).parentElement;
    expect(row?.className).toContain("2xl:row-start-1");
    expect(row?.className).toContain("2xl:grid-cols-subgrid");
    expect(row?.className).toContain("2xl:*:col-start-2");
    expect(row?.parentElement).toBe(layerOf("Hear about new clubs first").parentElement?.parentElement);
    unmount();
    // No sticky section: the breadcrumb stands on its own before the body, as it always has.
    const { container } = renderBody({ sides: [], breadcrumb: crumb });
    expect(container.firstElementChild?.tagName).toBe("NAV");
  });

  it("is an ordinary section, with no column, on a page that marks none", () => {
    renderBody({ sides: [] });
    expect(document.querySelector('[class*="2xl:sticky"]')).toBeNull();
    expect(document.querySelector('[class*="2xl:"]')).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Hear about new clubs first",
      "Questions",
      "Ready?",
    ]);
  });
});

describe("a sticky section on each side", () => {
  it("draws both at their places in the structure", () => {
    renderBody({ sides: ["right", "left"] });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Hear about new clubs first",
      "Questions",
      "Get the term dates",
      "Ready?",
    ]);
  });

  it("stands each card in its own gutter, across the sections' rows, and floors both gutters", () => {
    renderBody({ sides: ["right", "left"] });
    const right = railOf("Hear about new clubs first");
    const left = railOf("Get the term dates");
    expect(right.parentElement?.className).toContain("2xl:col-start-3");
    expect(left.parentElement?.className).toContain("2xl:col-start-1");
    for (const rail of [right, left]) {
      expect(rail.parentElement?.style.gridRow).toBe("1 / span 3");
      expect(rail.className).toContain("2xl:sticky");
      // Each clamps by the height it publishes on itself.
      expect(rail.className).toContain("var(--landing-rail-height)");
    }
    expect(left.className).toContain("2xl:ml-auto");
    expect(right.className).not.toContain("ml-auto");
    // One grid holds both, the content between two floored gutters.
    const page = right.parentElement?.parentElement?.parentElement;
    expect(left.parentElement?.parentElement?.parentElement).toBe(page);
    const [first, content, last] = tracks(page?.className);
    expect(first).toContain(FLOOR);
    expect(last).toContain(FLOOR);
    expect(content).toBe("minmax(0,74rem)");
  });

  it("states its pictures' sizes at the measure the two cards leave, and one card leaves the full one", () => {
    const PIC = id(50);
    const GALLERY = id(51);
    const sizes = (sides: readonly LandingStickySide[]) => {
      const { unmount } = render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <UtmProvider initialUtm={NO_UTM_ATTRIBUTION}>
            <LandingPageBody
              sections={[
                { id: HERO, type: "hero" },
                { id: GALLERY, type: "image", background: "default", images: [{ id: id(52), imageId: PIC }] },
                ...sides.map((side, n): LandingSection => ({
                  id: n === 0 ? FORM : DATES,
                  type: "subscribe",
                  background: "default",
                  sticky: side,
                })),
              ]}
              pictures={{ [PIC]: { path: "a.jpg", purpose: "landing_image" } }}
              testimonials={{}}
              guideIds={[]}
              sectionTexts={{ ...TEXTS, [HERO]: { headline: "Clubs", imageId: PIC, imageAlt: "Hero" }, [GALLERY]: { alts: { [id(52)]: "Gallery" } } }}
              textLocale="en"
              locale="en"
              products={null}
              pageId={id(500)}
              preview={false}
            />
          </UtmProvider>
        </NextIntlClientProvider>,
      );
      const found = ["Hero", "Gallery"].map((alt) => screen.getByAltText(alt).getAttribute("sizes"));
      unmount();
      return found;
    };
    const page = [
      "(min-width: 1152px) 544px, (min-width: 1024px) calc(50vw - 3rem), calc(100vw - 2rem)",
      "(min-width: 928px) 896px, calc(100vw - 2rem)",
    ];
    expect(sizes([])).toEqual(page);
    expect(sizes(["right"])).toEqual(page);
    // Between two cards the measure is the viewport less 720px from 2xl until
    // it reaches 1152 at 1872; a picture narrower than that is fixed sooner.
    expect(sizes(["right", "left"])).toEqual([
      `(min-width: 1872px) 544px, (min-width: 1536px) calc(50vw - 392px), ${page[0]}`,
      `(min-width: 1616px) 896px, (min-width: 1536px) calc(100vw - 720px), ${page[1]}`,
    ]);
  });
});

describe("a sticky call to action and a sticky guide", () => {
  const GUIDE_SECTION = id(20);
  const GUIDE = id(21);
  const COVER = id(22);
  const STICKY_CTA = id(23);

  const SECTIONS: LandingSection[] = [
    { id: HERO, type: "hero" },
    { id: FAQ, type: "faq", background: "card", items: [{ id: id(10) }] },
    {
      id: STICKY_CTA,
      type: "cta",
      background: "card",
      button: { kind: "internal", path: "/shop" },
      sticky: "right",
    },
    { id: GUIDE_SECTION, type: "guide", background: "card", guideId: GUIDE, imageId: COVER, sticky: "left" },
  ];
  const STICKY_TEXTS: LandingSectionTexts = {
    ...TEXTS,
    [STICKY_CTA]: { eyebrow: "Clubs", heading: "Find your club", body: "Every term, every city.", buttonLabel: "Browse clubs" },
    [GUIDE_SECTION]: {
      eyebrow: "Free guide",
      heading: "A parent's guide to gaming",
      description: "Everything we tell parents, in one PDF.",
      imageAlt: "The guide's cover",
    },
  };

  function renderSticky(guideIds: readonly string[] = [GUIDE]) {
    return render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <UtmProvider initialUtm={NO_UTM_ATTRIBUTION}>
          <LandingPageBody
            sections={SECTIONS}
            pictures={{ [COVER]: { path: "cover.jpg", purpose: "landing_image" } }}
            testimonials={{}}
            guideIds={guideIds}
            sectionTexts={STICKY_TEXTS}
            textLocale="en"
            locale="en"
            products={null}
            pageId={id(500)}
            preview={false}
          />
        </UtmProvider>
      </NextIntlClientProvider>,
    );
  }

  /** The sticky card around a heading: the rail's one card, never a card inside a card. */
  function cardOf(heading: string): HTMLElement {
    const cards = railOf(heading).querySelectorAll<HTMLElement>("[data-sticky-card]");
    expect(cards).toHaveLength(1);
    return cards[0];
  }

  /** Whether a class list holds this class itself, not only a breakpoint's variant of it. */
  const holds = (element: Element, name: string) => element.classList.contains(name);

  it("draws the call to action as its closing card in the flow and the sticky card from 2xl", () => {
    renderSticky();
    const card = cardOf("Find your club");
    // On its band below 2xl, like any card section.
    expect(below2xl(layerOf("Find your club"))).toEqual(["bg-card"]);
    // The flow's centred closing card, turned start-aligned under the card's heading from 2xl.
    const content = card.lastElementChild;
    expect(content?.className).toContain("items-center");
    expect(content?.className).toContain("text-center");
    expect(content?.className).toContain("2xl:text-start 2xl:[&_h2]:text-card-title");
    expect(card.textContent).toContain("Every term, every city.");
    const button = screen.getByRole("link", { name: /Browse clubs/ });
    expect(card.contains(button)).toBe(true);
    expect(holds(button, "w-full")).toBe(false);
    expect(holds(button, "2xl:w-full")).toBe(true);
  });

  it("draws the guide beside its cover in the flow, and from 2xl the sticky card with the cover across its top", () => {
    mockAuth.mockReturnValue({ user: null });
    const { unmount } = renderSticky();
    const card = cardOf("A parent's guide to gaming");
    expect(card.className).toContain("max-2xl:contents");
    const cover = screen.getByRole("img", { name: "The guide's cover" });
    expect(card.contains(cover)).toBe(true);
    // After the words in the document, as in the flow; first in the card from 2xl.
    const heading = screen.getByRole("heading", { name: "A parent's guide to gaming" });
    expect(heading.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cover.parentElement?.className).toBe("2xl:order-first");
    // In the flow it is in its half column; in the card, the card's 20rem.
    expect(cover.getAttribute("sizes")).toBe(
      "(min-width: 1536px) 20rem, (min-width: 1152px) 544px, (min-width: 1024px) calc(50vw - 3rem), calc(100vw - 2rem)",
    );
    // Signed out: the account ask the card's width from 2xl, its sign-in line under it.
    const ask = screen.getByRole("link", { name: "Create a free account to download" });
    expect(card.contains(ask)).toBe(true);
    expect(holds(ask, "w-full")).toBe(false);
    expect(holds(ask, "2xl:w-full")).toBe(true);
    expect(card.textContent).toContain("Already have an account?");
    unmount();
    // Signed in: the download in the same place.
    mockAuth.mockReturnValue({ user: { id: id(600) } });
    renderSticky();
    const download = screen.getByRole("link", { name: "Download the guide" });
    expect(cardOf("A parent's guide to gaming").contains(download)).toBe(true);
    expect(holds(download, "2xl:w-full")).toBe(true);
    mockAuth.mockReturnValue({ user: null });
  });

  it("draws nothing for a sticky guide the read did not answer, and holds no gutter open for it", () => {
    const { container } = renderSticky([]);
    expect(screen.queryByRole("heading", { name: "A parent's guide to gaming" })).toBeNull();
    // One card left, the call to action's, and no empty layer on the guide's side.
    expect(container.querySelectorAll('[class*="2xl:sticky"]')).toHaveLength(1);
    expect(container.querySelector('[class*="2xl:col-start-1"]')).toBeNull();
    const [first, , last] = tracks(layerOf("Find your club").parentElement?.parentElement?.className);
    expect(last).toContain(FLOOR);
    expect(first).not.toContain(FLOOR);
  });
});
