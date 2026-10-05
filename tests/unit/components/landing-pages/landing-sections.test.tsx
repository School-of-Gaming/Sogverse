import { afterAll, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import type { LandingSection, LandingSectionTexts } from "@/lib/landing-pages/sections";
import { LANDING_SECTION_TYPES } from "@/lib/landing-pages/sections";
import type { SupportedLocale } from "@/lib/constants/locales";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import { LANDING_SECTION_RENDERERS } from "@/components/landing-pages/landing-sections";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sog.test");
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
const ITEM = (n: number) => id(100 + n);

const SECTIONS: LandingSection[] = [
  {
    id: HERO,
    type: "hero",
    imageId: PIC_A,
    button: { kind: "internal", path: "/shop" },
  },
  { id: TEXT, type: "text", imageId: PIC_B, imageSide: "start" },
  {
    id: IMAGE,
    type: "image",
    images: [
      { id: ITEM(1), imageId: PIC_A },
      { id: ITEM(2), imageId: id(99) },
    ],
  },
  {
    id: POINTS,
    type: "points",
    items: [
      { id: ITEM(3), icon: "trophy" },
      { id: ITEM(4), icon: "shield-check" },
    ],
  },
  { id: STEPS, type: "steps", items: [{ id: ITEM(5) }, { id: ITEM(6) }] },
  { id: FAQ, type: "faq", items: [{ id: ITEM(7) }, { id: ITEM(8) }] },
  { id: CTA, type: "cta", button: { kind: "external", url: "https://partner.example/join" } },
];

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
    items: { [ITEM(7)]: { question: "Who leads it?", answer: "A *Game Educator*." } },
  },
  [CTA]: { heading: "Ready?", body: "Join today.", buttonLabel: "Join" },
};

const PATHS = { [PIC_A]: "a.jpg", [PIC_B]: "b.jpg" };

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
        imagePaths={PATHS}
        sectionTexts={overrides.texts ?? TEXTS}
        textLocale={overrides.textLocale ?? locale}
        locale={locale}
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

  it("paints pictures with their alt text and reserved size, skipping one that is gone", () => {
    renderBody();
    const hero = screen.getByAltText("Children playing together");
    expect(hero.getAttribute("width")).toBe("1600");
    expect(hero.getAttribute("height")).toBe("900");
    expect(hero.getAttribute("src")).toContain(encodeURIComponent("landing-images/a.jpg"));
    // The image section's second picture has left the catalogue.
    const figure = enclosing(screen.getByText("From last term"), "figure");
    expect(within(figure).getAllByRole("img")).toHaveLength(1);
    expect(within(figure).getByAltText("A club room")).toBeTruthy();
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
    expect(screen.getByText("Who leads it?")).toBeTruthy();
    expect(screen.getByText("Game Educator").tagName).toBe("EM");
    // The second question was never written, so it has no row.
    expect(screen.getAllByText(/Who leads it\?/)).toHaveLength(1);
    expect(document.querySelectorAll("details")).toHaveLength(1);
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
