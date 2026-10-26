import { afterAll, describe, expect, it, vi } from "vitest";
import { SITE_ORIGIN } from "../../../mocks/site-origin";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enRichText from "@/../messages/en/richText.json";
import type { LandingSection, LandingSectionTexts } from "@/lib/landing-pages/sections";
import { LANDING_SECTION_TYPES } from "@/lib/landing-pages/sections";
import type { SupportedLocale } from "@/lib/constants/locales";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import type { LandingPictures } from "@/services/landing-pages/landing-pages.contracts";
import { LANDING_SECTION_RENDERERS } from "@/components/landing-pages/landing-sections";

const messages = { richText: enRichText };

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE_ORIGIN);
afterAll(() => vi.unstubAllEnvs());

/**
 * **The section renderers, through the one body both the live page and the
 * preview render.** What is pinned is what a reader and a crawler are handed:
 * the hero's headline is the page's only H1, pictures carry their alt text and
 * their reserved size, buttons go where their target says in the page's
 * language, and an unwritten word is left out rather than drawn as a blank.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HERO = id(1);
const TEXT = id(2);
const IMAGE = id(3);
const POINTS = id(4);
const STEPS = id(5);
const FAQ = id(6);
const CTA = id(7);
const PIC_A = id(10);
const PIC_B = id(11);
const SQUARE_A = id(12);
const SQUARE_B = id(13);
const PORTRAIT = id(14);
const ITEM = (n: number) => id(100 + n);

const SECTIONS: LandingSection[] = [
  {
    id: HERO,
    type: "hero",
    imageId: PIC_A,
    button: { kind: "internal", path: "/shop" },
  },
  { id: TEXT, type: "text", background: "default", imageId: PIC_B, imageSide: "start" },
  {
    id: IMAGE,
    type: "image",
    background: "default",
    images: [
      { id: ITEM(1), imageId: PIC_A },
      { id: ITEM(2), imageId: PIC_B },
    ],
  },
  {
    id: POINTS,
    type: "points",
    background: "default",
    items: [
      { id: ITEM(3), icon: "trophy" },
      { id: ITEM(4), icon: "shield-check" },
    ],
  },
  { id: STEPS, type: "steps", background: "default", items: [{ id: ITEM(5) }, { id: ITEM(6) }] },
  { id: FAQ, type: "faq", background: "default", items: [{ id: ITEM(7) }, { id: ITEM(8) }] },
  { id: CTA, type: "cta", background: "default", button: { kind: "external", url: "https://partner.example/join" } },
];

const FAQ_ITEMS = { [ITEM(7)]: { question: "Who leads it?", answer: "A *Game Educator*." } };

const TEXTS: LandingSectionTexts = {
  [HERO]: {
    eyebrow: "Espoo",
    headline: "Gaming clubs in Espoo",
    subline: "After school, every week.",
    buttonLabel: "Find a club",
    imageAlt: "Children playing together",
  },
  [TEXT]: { heading: "What happens in a club", body: "We **build** things. See [the shop](/shop)." },
  [IMAGE]: { heading: "Pictures", caption: "From last term", alts: { [ITEM(1)]: "A club room" } },
  [POINTS]: {
    heading: "Why families choose us",
    items: { [ITEM(3)]: { title: "Fun", body: "Lots." }, [ITEM(4)]: { title: "Safe", body: "Always." } },
  },
  [STEPS]: {
    heading: "How to join",
    items: { [ITEM(5)]: { title: "Choose", body: "A club." }, [ITEM(6)]: { title: "Register", body: "Online." } },
  },
  [FAQ]: {
    heading: "Questions",
    items: FAQ_ITEMS,
  },
  [CTA]: { heading: "Ready?", body: "Join today.", buttonLabel: "Join" },
};

const PICTURES: LandingPictures = {
  [PIC_A]: { path: "a.jpg", purpose: "landing_image" },
  [PIC_B]: { path: "b.jpg", purpose: "landing_image" },
  [SQUARE_A]: { path: "sa.jpg", purpose: "landing_square_image" },
  [SQUARE_B]: { path: "sb.jpg", purpose: "landing_square_image" },
  [PORTRAIT]: { path: "p.jpg", purpose: "landing_portrait_image" },
};

/** The nearest `selector` around `element`, which the test requires to exist. */
function enclosing(element: HTMLElement, selector: string): HTMLElement {
  const found = element.closest(selector);
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector} around the element`);
  return found;
}

function renderBody(
  overrides: Partial<{
    sections: LandingSection[];
    texts: LandingSectionTexts;
    textLocale: SupportedLocale;
    locale: SupportedLocale;
  }> = {},
) {
  const locale = overrides.locale ?? "en";
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LandingPageBody
        sections={overrides.sections ?? SECTIONS}
        pictures={PICTURES}
        testimonials={{}}
        guideIds={[]}
        sectionTexts={overrides.texts ?? TEXTS}
        textLocale={overrides.textLocale ?? locale}
        locale={locale}
        products={null}
        pageId={id(500)}
        preview={false}
      />
    </NextIntlClientProvider>,
  );
}

describe("the landing page renderers", () => {
  it("draws every section type", () => {
    expect(Object.keys(LANDING_SECTION_RENDERERS).sort()).toEqual(
      [...LANDING_SECTION_TYPES].sort(),
    );
  });

  it("makes the hero's headline the page's only H1, the rest H2s", () => {
    renderBody();
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s.map((h) => h.textContent)).toEqual(["Gaming clubs in Espoo"]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "What happens in a club",
      "Pictures",
      "Why families choose us",
      "How to join",
      "Questions",
      "Ready?",
    ]);
  });

  it("paints pictures with their alt text and reserved size", () => {
    renderBody();
    const hero = screen.getByAltText("Children playing together");
    expect(hero.getAttribute("width")).toBe("1600");
    expect(hero.getAttribute("height")).toBe("900");
    expect(hero.getAttribute("src")).toContain(encodeURIComponent("landing-images/a.jpg"));
    // The second picture's alt is not written, so it is decorative.
    const figure = enclosing(screen.getByText("From last term"), "figure");
    expect(figure.querySelectorAll("img")).toHaveLength(2);
    expect(within(figure).getByAltText("A club room")).toBeTruthy();
  });

  it("throws for a picture the copy names and does not carry", () => {
    // The database derives a copy's pictures from everything it names, so
    // this is a broken invariant rather than a picture to leave out.
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      renderBody({
        sections: [
          { id: HERO, type: "hero" },
          { id: IMAGE, type: "image", background: "default", images: [{ id: ITEM(1), imageId: id(99) }] },
        ],
        texts: {},
      }),
    ).toThrow(/carries no path/);
    vi.mocked(console.error).mockRestore();
  });

  it("reserves a square or portrait text picture's own box, held narrower than its column", () => {
    for (const [imageId, width, height, bucket, frame, sizes] of [
      [SQUARE_A, "1200", "1200", "landing-square-images/sa.jpg", "max-w-md", "(min-width: 480px) 448px, calc(100vw - 2rem)"],
      [PORTRAIT, "1200", "1500", "landing-portrait-images/p.jpg", "max-w-sm", "(min-width: 416px) 384px, calc(100vw - 2rem)"],
    ] as const) {
      const { unmount } = renderBody({
        sections: [
          { id: HERO, type: "hero" },
          { id: TEXT, type: "text", background: "default", imageId, imageSide: "end" },
        ],
        texts: { [TEXT]: { heading: "Beside", body: "Words.", imageAlt: "Beside the words" } },
      });
      const picture = screen.getByAltText("Beside the words");
      expect(picture.getAttribute("width")).toBe(width);
      expect(picture.getAttribute("height")).toBe(height);
      expect(picture.getAttribute("src")).toContain(encodeURIComponent(bucket));
      expect(picture.getAttribute("sizes")).toBe(sizes);
      expect(picture.parentElement?.className).toContain(frame);
      unmount();
    }
  });

  it("lays an image section out by its pictures' shape, with honest sizes", () => {
    const gallery = (images: string[]): LandingSection[] => [
      { id: HERO, type: "hero" },
      { id: IMAGE, type: "image", background: "default", images: images.map((imageId, n) => ({ id: ITEM(20 + n), imageId })) },
    ];
    const sizesOf = () =>
      [...document.querySelectorAll("figure img")].map((img) => img.getAttribute("sizes"));

    const wide = renderBody({ sections: gallery([PIC_A, PIC_B]), texts: {} });
    expect(sizesOf()).toEqual([
      "(min-width: 1056px) 504px, (min-width: 640px) calc(50vw - 1.5rem), calc(100vw - 2rem)",
      "(min-width: 1056px) 504px, (min-width: 640px) calc(50vw - 1.5rem), calc(100vw - 2rem)",
    ]);
    wide.unmount();

    const squares = renderBody({
      sections: gallery([SQUARE_A, SQUARE_B, SQUARE_A, SQUARE_B]),
      texts: {},
    });
    expect(new Set(sizesOf())).toEqual(
      new Set([
        "(min-width: 1184px) 276px, (min-width: 1024px) calc(25vw - 1.25rem), (min-width: 640px) calc(50vw - 1.5rem), calc(100vw - 2rem)",
      ]),
    );
    const grid = document.querySelector("figure > div");
    expect(grid?.className).toContain("lg:grid-cols-4");
    for (const img of document.querySelectorAll("figure img")) {
      expect(img.getAttribute("width")).toBe("1200");
      expect(img.getAttribute("height")).toBe("1200");
      expect(img.className).toContain("aspect-square");
    }
    squares.unmount();

    renderBody({ sections: gallery([PORTRAIT]), texts: {} });
    expect(sizesOf()).toEqual(["(min-width: 480px) 448px, calc(100vw - 2rem)"]);
    expect(document.querySelector("figure")?.className).toContain("max-w-md");
    expect(document.querySelector("figure img")?.className).toContain("aspect-[4/5]");
  });

  it("sends an own-site button to the page's language and an outside one to a new tab", () => {
    renderBody({ locale: "fi" });
    expect(screen.getByRole("link", { name: "Find a club" }).getAttribute("href")).toBe("/fi/kauppa");
    const join = screen.getByRole("link", { name: /Join/ });
    expect(join.getAttribute("href")).toBe("https://partner.example/join");
    expect(join.getAttribute("target")).toBe("_blank");
    expect(join.getAttribute("rel")).toBe("noopener noreferrer");
    expect(join.textContent).toContain(messages.richText.opensInNewTab);
  });

  it("says a button opens a new tab in the page's language, inside a body in another", () => {
    renderBody({ locale: "sv", textLocale: "en" });
    const said = screen.getByText(messages.richText.opensInNewTab);
    expect(said.getAttribute("lang")).toBe("sv");
    expect(screen.getByRole("link", { name: /Join/ }).closest("[lang]")?.getAttribute("lang")).toBe("en");
  });

  it("renders authored markdown through the landing use case, links localised", () => {
    renderBody({ locale: "fi" });
    expect(screen.getByText("build").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "the shop" }).getAttribute("href")).toBe("/fi/kauppa");
  });

  it("numbers steps, draws point icons and lists only written questions", () => {
    renderBody();
    const steps = enclosing(screen.getByRole("heading", { name: "How to join" }), "section");
    expect(within(steps).getAllByRole("listitem")).toHaveLength(2);
    expect(within(steps).getByText("2")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Safe" })).toBeTruthy();
    // A question is an H3 under the section's H2, inside the row's summary.
    const question = screen.getByRole("heading", { level: 3, name: "Who leads it?" });
    expect(question.parentElement?.tagName).toBe("SUMMARY");
    expect(screen.getByText("Game Educator").tagName).toBe("EM");
    // The second question was never written, so it has no row.
    expect(screen.getAllByText(/Who leads it\?/)).toHaveLength(1);
    expect(document.querySelectorAll("details")).toHaveLength(1);
  });

  it("lays a card section on a full-width band, its content keeping the section's container", () => {
    const { container } = renderBody({
      sections: SECTIONS.map((section) =>
        section.type === "points" || section.type === "steps" || section.type === "cta"
          ? { ...section, background: "card" }
          : section,
      ),
    });
    const body = container.firstElementChild;
    const sectionOf = (heading: string) =>
      enclosing(screen.getByRole("heading", { name: heading }), "section");

    // A band is the card ground and nothing more — no container, no width cap,
    // no spacing of its own — directly in the body, so it runs edge to edge.
    const points = sectionOf("Why families choose us");
    const band = points.parentElement;
    expect(band?.className).toBe("bg-card");
    expect(band?.parentElement).toBe(body);
    expect(points.className).toContain("container");

    // Adjacent card sections share one run of the card ground: two bands
    // touching, with each section's own padding inside them.
    const steps = sectionOf("How to join");
    expect(steps.parentElement?.className).toBe("bg-card");
    expect(band?.nextElementSibling).toBe(steps.parentElement);

    // A default section sits straight on the page ground between them.
    const faq = sectionOf("Questions");
    expect(faq.parentElement).toBe(body);
    expect(sectionOf("Ready?").parentElement?.className).toBe("bg-card");
    expect(enclosing(screen.getByRole("heading", { level: 1 }), "section").parentElement).toBe(body);
  });

  it("lays no band under a section on the default ground", () => {
    const { container } = renderBody();
    const body = container.firstElementChild;
    expect([...(body?.children ?? [])].every((child) => child.tagName === "SECTION")).toBe(true);
  });

  it("makes the questions H2s when the FAQ section has no heading of its own", () => {
    renderBody({
      sections: [SECTIONS[0], SECTIONS[5]],
      texts: { [FAQ]: { items: FAQ_ITEMS } },
    });
    const question = screen.getByRole("heading", { level: 2, name: "Who leads it?" });
    expect(question.parentElement?.tagName).toBe("SUMMARY");
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("titles points and steps as H3s under the section's H2", () => {
    renderBody({ sections: [SECTIONS[0], SECTIONS[3], SECTIONS[4]] });
    for (const [heading, titles] of [
      ["Why families choose us", ["Fun", "Safe"]],
      ["How to join", ["Choose", "Register"]],
    ] as const) {
      const section = enclosing(screen.getByRole("heading", { level: 2, name: heading }), "section");
      expect(within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(titles);
      expect(within(section).getAllByRole("heading", { level: 2 })).toHaveLength(1);
    }
  });

  it("makes points' and steps' titles H2s when the section has no heading of its own", () => {
    renderBody({
      sections: [SECTIONS[0], SECTIONS[3], SECTIONS[4]],
      texts: {
        [HERO]: { headline: "Gaming clubs in Espoo" },
        [POINTS]: { items: { [ITEM(3)]: { title: "Fun" }, [ITEM(4)]: { title: "Safe" } } },
        [STEPS]: {
          eyebrow: "Joining",
          items: { [ITEM(5)]: { title: "Choose" }, [ITEM(6)]: { title: "Register" } },
        },
      },
    });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Fun",
      "Safe",
      "Choose",
      "Register",
    ]);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("keeps a text section's headings, and unwraps an FAQ answer's to its words", () => {
    renderBody({
      sections: [SECTIONS[0], SECTIONS[1], SECTIONS[5]],
      texts: {
        [TEXT]: { heading: "What happens in a club", body: "## Building\n\nWe build things." },
        [FAQ]: {
          heading: "Questions",
          items: { [ITEM(7)]: { question: "Who leads it?", answer: "## Our gedus\n\nA Game Educator." } },
        },
      },
    });
    // The text section's level-2 heading is drawn under its own H2.
    expect(screen.getByRole("heading", { level: 3, name: "Building" })).toBeTruthy();
    // The answer's never ranks beside its question: its words stay, as text.
    expect(screen.queryByRole("heading", { name: "Our gedus" })).toBeNull();
    const answer = screen.getByText("Our gedus");
    expect(answer.closest("details")).not.toBeNull();
    expect(answer.closest("h1, h2, h3, h4, h5, h6")).toBeNull();
  });

  it("marks the words' language where it is not the page's", () => {
    const { container, unmount } = renderBody({ locale: "sv", textLocale: "en" });
    expect(container.firstElementChild?.getAttribute("lang")).toBe("en");
    unmount();
    const same = renderBody({ locale: "en" });
    expect(same.container.firstElementChild?.hasAttribute("lang")).toBe(false);
  });

  it("leaves out what a version still being written lacks", () => {
    renderBody({
      sections: [SECTIONS[0], SECTIONS[6]],
      texts: { [HERO]: { headline: "Draft" } },
    });
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Draft");
    // The picture is drawn; its alt is not written yet, so it is decorative.
    expect(document.querySelectorAll("img")).toHaveLength(1);
    expect(document.querySelector("img")?.getAttribute("alt")).toBe("");
  });
});
