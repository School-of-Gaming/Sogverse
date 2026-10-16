import { afterAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import {
  LANDING_STICKY_ANCHOR,
  LandingPageBody,
} from "@/components/landing-pages/landing-page-body";
import type {
  LandingSection,
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
 * after every other section, in the column that is sticky from `xl` on the
 * side the structure names; the sections clearing that side from `xl`; and
 * the jump button under the hero's content, hidden from `xl`, in the
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

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HERO = id(1);
const FORM = id(2);
const FAQ = id(3);
const CTA = id(4);

function structure(side: LandingStickySide | null): LandingSection[] {
  return [
    { id: HERO, type: "hero", button: { kind: "internal", path: "/shop" } },
    side === null ? { id: FORM, type: "subscribe" } : { id: FORM, type: "subscribe", sticky: side },
    { id: FAQ, type: "faq", items: [{ id: id(10) }] },
    { id: CTA, type: "cta", button: { kind: "internal", path: "/shop" } },
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
  subscribed = false,
}: {
  side?: LandingStickySide | null;
  texts?: LandingSectionTexts;
  subscribed?: boolean;
} = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <UtmProvider initialUtm={NO_UTM_ATTRIBUTION}>
        <LandingPageBody
          sections={structure(side)}
          imagePaths={{}}
          sectionTexts={texts}
          textLocale="en"
          locale="en"
          pageId={id(500)}
          subscribed={subscribed}
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

  it("sits in the column that is sticky from xl, on the side the structure names", () => {
    for (const side of ["right", "left"] as const) {
      const { unmount } = renderBody({ side });
      const rail = document.getElementById(LANDING_STICKY_ANCHOR);
      expect(rail?.className).toContain("xl:sticky");
      expect(rail?.className).toContain("xl:w-[var(--landing-rail-width)]");
      expect(rail?.parentElement?.className).toContain(
        side === "right" ? "xl:justify-end" : "xl:justify-start",
      );
      // The sections clear the column's side from xl, and only that side.
      const page = rail?.parentElement?.parentElement;
      expect(page?.className).toContain(`xl:[--landing-rail-space-${side}:`);
      expect(page?.className).not.toContain(
        `--landing-rail-space-${side === "right" ? "left" : "right"}:`,
      );
      expect(within(rail ?? document.body).getByRole("heading", { level: 2 }).textContent).toBe(
        "Hear about new clubs first",
      );
      unmount();
    }
  });

  it("draws the jump under the hero's content, hidden from xl, in the section's button's words", () => {
    renderBody();
    const button = jump();
    expect(button).not.toBeNull();
    expect(button?.className).toContain("xl:hidden");
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

  it("withdraws the jump while the section offers nothing: a reader back from confirming, or no button words", () => {
    const confirmed = renderBody({ subscribed: true });
    expect(jump()).toBeNull();
    confirmed.unmount();
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
