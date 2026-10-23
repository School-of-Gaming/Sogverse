import { afterAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import common from "@/../messages/en/common.json";
import landingSubscribe from "@/../messages/en/landingSubscribe.json";
import {
  LANDING_STICKY_ANCHOR,
  LandingPageBody,
} from "@/components/landing-pages/landing-page-body";
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
 * **A page's sticky section, as the body draws it.** jsdom has no layout, so
 * what is pinned is the markup the layout follows: the section drawn once,
 * after every other section, in the gutter on the side the structure names,
 * sticky from `2xl`; every other section in the grid's content track, never
 * padded for the card, a band spanning every track; and the jump button
 * under the hero's content, hidden from `2xl`, in the
 * section's own button's words, present only while the section offers
 * something, and scrolling to the column when tapped. Where the column
 * actually sits at each width was measured in a real browser.
 */

/** jsdom has no layout, so no `scrollIntoView` either; the jump's call is what is read. */
const scrollIntoView = vi.fn();
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: scrollIntoView,
});

const messages = { common, landingSubscribe };

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HERO = id(1);
const FORM = id(2);
const FAQ = id(3);
const CTA = id(4);

function structure(
  side: LandingStickySide | null,
  background: LandingSectionBackground = "default",
): LandingSection[] {
  return [
    { id: HERO, type: "hero", button: { kind: "internal", path: "/shop" } },
    side === null
      ? { id: FORM, type: "subscribe", background }
      : { id: FORM, type: "subscribe", background, sticky: side },
    { id: FAQ, type: "faq", background, items: [{ id: id(10) }] },
    { id: CTA, type: "cta", background: "default", button: { kind: "internal", path: "/shop" } },
  ];
}

const TEXTS: LandingSectionTexts = {
  [HERO]: { headline: "Gaming clubs in Espoo", buttonLabel: "Find a club" },
  [FORM]: { heading: "Hear about new clubs first", buttonLabel: "Keep me posted" },
  [FAQ]: { heading: "Questions", items: { [id(10)]: { question: "Who?", answer: "Us." } } },
  [CTA]: { heading: "Ready?", buttonLabel: "Join" },
};

function renderBody({
  side = "right",
  texts = TEXTS,
  background = "default",
}: {
  side?: LandingStickySide | null;
  texts?: LandingSectionTexts;
  background?: LandingSectionBackground;
} = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <UtmProvider initialUtm={NO_UTM_ATTRIBUTION}>
        <LandingPageBody
          sections={structure(side, background)}
          pictures={{}}
          testimonials={{}}
          guideIds={[]}
          sectionTexts={texts}
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

const heroOf = () => screen.getByRole("heading", { level: 1 }).closest("section");
/** The jump button, as distinct from the form's own submit, which shares its words. */
function jump(): HTMLElement | null {
  const hero = heroOf();
  if (hero === null) throw new Error("no hero");
  return within(hero).queryByRole("button", { name: "Keep me posted" });
}

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
    const floor = "minmax(calc(var(--landing-rail-width)+var(--landing-rail-gap)),1fr)";
    for (const side of ["right", "left"] as const) {
      const { unmount } = renderBody({ side });
      const rail = document.getElementById(LANDING_STICKY_ANCHOR);
      expect(rail?.className).toContain("2xl:sticky");
      expect(rail?.className).toContain("2xl:w-[var(--landing-rail-width)]");
      // Pinned against the content: a left card pushed to its gutter's inner edge.
      if (side === "left") expect(rail?.className).toContain("2xl:ml-auto");
      else expect(rail?.className).not.toContain("ml-auto");
      expect(rail?.parentElement?.className).toContain(
        side === "right" ? "2xl:col-start-3" : "2xl:col-start-1",
      );
      // The page's grid keeps the card's floor on its side and lets the other gutter close.
      const page = rail?.parentElement?.parentElement;
      const columns = `2xl:grid-cols-[${side === "left" ? `${floor}_minmax(0,74rem)_minmax(0,1fr)` : `minmax(0,1fr)_minmax(0,74rem)_${floor}`}]`;
      expect(page?.className).toContain(columns);
      expect(within(rail ?? document.body).getByRole("heading", { level: 2 }).textContent).toBe(
        "Hear about new clubs first",
      );
      unmount();
    }
  });

  it("never narrows or pads a section for the card: each sits in the content track of its own row", () => {
    renderBody();
    for (const name of ["Gaming clubs in Espoo", "Questions", "Ready?"]) {
      const section = screen.getByRole("heading", { name }).closest("section");
      expect(section?.className).toContain("container mx-auto px-4");
      expect(section?.className).not.toContain("landing-rail");
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
    expect(document.getElementById(LANDING_STICKY_ANCHOR)?.contains(form ?? null)).toBe(true);
    expect(form?.parentElement?.className).not.toContain("bg-card");
  });

  it("stacks the form's name fields in the column, which is narrower than the viewport says", () => {
    /** The grid holding the first and last name, as the form draws it. */
    const nameRow = () =>
      document.querySelector('input[autocomplete="given-name"]')?.closest(".grid")?.className;
    const { unmount } = renderBody();
    expect(nameRow()).toBeDefined();
    expect(nameRow()).not.toContain("grid-cols-2");
    unmount();
    renderBody({ side: null });
    expect(nameRow()).toContain("sm:grid-cols-2");
  });

  it("draws the jump under the hero's content, hidden from 2xl, in the section's button's words", () => {
    renderBody();
    const button = jump();
    expect(button).not.toBeNull();
    expect(button?.className).toContain("2xl:hidden");
    // The hero's own button stays where it is, before the jump.
    const hero = heroOf();
    const controls = [...(hero?.querySelectorAll("a, button") ?? [])];
    expect(controls.map((element) => element.textContent)).toEqual(["Find a club", "Keep me posted"]);
  });

  it("scrolls to the column when the jump is tapped", () => {
    renderBody();
    scrollIntoView.mockClear();
    const button = jump();
    if (button === null) throw new Error("no jump");
    fireEvent.click(button);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById(LANDING_STICKY_ANCHOR));
  });

  it("withdraws the jump while the section offers nothing: no button words", () => {
    renderBody({ texts: { ...TEXTS, [FORM]: { heading: "Hear about new clubs first" } } });
    expect(jump()).toBeNull();
  });

  it("is an ordinary section, with no column and no jump, on a page that marks none", () => {
    renderBody({ side: null });
    expect(document.getElementById(LANDING_STICKY_ANCHOR)).toBeNull();
    expect(jump()).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Hear about new clubs first",
      "Questions",
      "Ready?",
    ]);
  });
});
