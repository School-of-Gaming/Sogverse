import { afterAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enRichText from "@/../messages/en/richText.json";
import enTestimonial from "@/../messages/en/testimonial.json";
import fiRichText from "@/../messages/fi/richText.json";
import fiTestimonial from "@/../messages/fi/testimonial.json";
import type { SupportedLocale } from "@/lib/constants/locales";
import type {
  LandingSection,
  LandingSectionTexts,
  LandingTestimonialArrangement,
} from "@/lib/landing-pages/sections";
import { LANDING_TESTIMONIAL_SLOTS } from "@/lib/landing-pages/sections";
import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import type { PublicTestimonial } from "@/services/testimonials/testimonials.contracts";

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");
vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://sog.test");
afterAll(() => vi.unstubAllEnvs());

const en = { richText: enRichText, testimonial: enTestimonial };
const fi = { richText: fiRichText, testimonial: fiTestimonial };

/**
 * **A landing page's testimonials section** draws the store's testimonials in
 * the arrangement the admin chose, through the arrangements the home page and
 * About share: the large quote, two across, three across, or About's whole
 * showcase. Pinned here: each arrangement's grid, the showcase's groups by
 * slot position, the optional header, a testimonial the read did not answer
 * leaving its slot out, a section with none drawn not at all, and the
 * reader's language — the testimonial's own fallback, marked against the
 * page's language even inside a body shown in another.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HERO = id(1);
const QUOTES = id(2);
const T = (n: number) => id(100 + n);

const testimonial = (n: number, fiToo = false): PublicTestimonial => ({
  id: T(n),
  versions: [
    { locale: "en", from: `Parent ${n}`, quote: `Quote ${n}` },
    ...(fiToo ? [{ locale: "fi" as const, from: `Vanhempi ${n}`, quote: `Lainaus ${n}` }] : []),
  ],
});

const STORE: Record<string, PublicTestimonial> = Object.fromEntries(
  [1, 2, 3, 4, 5, 6].map((n) => [T(n), testimonial(n, n === 1)]),
);

function sections(arrangement: LandingTestimonialArrangement, ids: string[]): LandingSection[] {
  return [
    { id: HERO, type: "hero" },
    { id: QUOTES, type: "testimonials", arrangement, testimonialIds: ids },
  ];
}

function renderSection({
  arrangement,
  ids = Array.from({ length: LANDING_TESTIMONIAL_SLOTS[arrangement] }, (_, i) => T(i + 1)),
  texts = {},
  store = STORE,
  locale = "en",
  textLocale = locale,
}: {
  arrangement: LandingTestimonialArrangement;
  ids?: string[];
  texts?: LandingSectionTexts;
  store?: Record<string, PublicTestimonial>;
  locale?: SupportedLocale;
  textLocale?: SupportedLocale;
}) {
  const { container } = render(
    <NextIntlClientProvider locale={locale} messages={locale === "fi" ? fi : en}>
      <LandingPageBody
        sections={sections(arrangement, ids)}
        pictures={{}}
        testimonials={store}
        sectionTexts={{ [HERO]: { headline: "Quotes" }, ...texts }}
        textLocale={textLocale}
        locale={locale}
      />
    </NextIntlClientProvider>,
  );
  // The hero is the first section; the testimonials one, when drawn, the second.
  const drawn = container.querySelectorAll("section");
  return { container, section: drawn.length > 1 ? drawn[1] : null };
}

const quotes = (root: Element | null) =>
  [...(root?.querySelectorAll("blockquote") ?? [])].map((quote) => quote.textContent);

describe("the testimonials section", () => {
  it("draws a feature as the one large centred quote", () => {
    const { section } = renderSection({ arrangement: "feature" });
    const figure = section?.querySelector("figure");
    expect(quotes(section)).toEqual(["“Quote 1”"]);
    expect(figure?.className.split(" ")).toEqual(
      expect.arrayContaining(["items-center", "text-center", "mx-auto", "max-w-3xl"]),
    );
    expect(section?.querySelector(".grid")).toBeNull();
  });

  it.each([
    ["pair", "md:grid-cols-2", 2],
    ["row", "md:grid-cols-3", 3],
  ] as const)("draws a %s as its quotes across, %s", (arrangement, columns, count) => {
    const { section } = renderSection({ arrangement });
    const grids = section?.querySelectorAll(".grid") ?? [];
    expect(grids).toHaveLength(1);
    expect(grids[0].className.split(" ")).toEqual(
      expect.arrayContaining(["mx-auto", "grid", "max-w-5xl", "gap-10", columns]),
    );
    expect(grids[0].querySelectorAll("figure")).toHaveLength(count);
  });

  it("draws a showcase as About does: the feature, the pair, then the row, by slot", () => {
    const { section } = renderSection({ arrangement: "showcase" });
    expect(quotes(section)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `“Quote ${n}”`));
    const grids = [...(section?.querySelectorAll(".grid") ?? [])];
    expect(grids.map((grid) => grid.querySelectorAll("figure").length)).toEqual([2, 3]);
    expect(grids[0].className).toContain("md:grid-cols-2");
    expect(grids[1].className).toContain("md:grid-cols-3");
  });

  it("keeps the showcase's groups by slot when a testimonial is not answered", () => {
    const { [T(2)]: _gone, ...store } = STORE;
    const { section } = renderSection({ arrangement: "showcase", store });
    const grids = [...(section?.querySelectorAll(".grid") ?? [])];
    expect(grids.map((grid) => grid.querySelectorAll("figure").length)).toEqual([1, 3]);
    expect(quotes(section)).not.toContain("“Quote 2”");
  });

  it("draws its header only when written, and the quotes without one", () => {
    const bare = renderSection({ arrangement: "row" });
    expect(bare.section?.querySelector("h2")).toBeNull();

    const headed = renderSection({
      arrangement: "row",
      texts: { [QUOTES]: { eyebrow: "Parents", heading: "What parents tell us", intro: "Words." } },
    });
    expect(headed.section?.querySelector("h2")?.textContent).toBe("What parents tell us");
    expect(headed.section?.textContent).toContain("Parents");
    expect(headed.section?.querySelector(".grid")?.className).toContain("mt-12");
  });

  it("is not drawn at all when none of its testimonials is answered", () => {
    const { container, section } = renderSection({
      arrangement: "pair",
      store: {},
      texts: { [QUOTES]: { heading: "What parents tell us" } },
    });
    expect(section).toBeNull();
    expect(container.textContent).not.toContain("What parents tell us");
  });

  it("shows each reader the testimonial's own version, falling back and marking it", () => {
    // A Finnish reader of a page whose version is Finnish: testimonial 1 has
    // Finnish, testimonial 2 falls back to English and says so.
    const { section } = renderSection({ arrangement: "pair", locale: "fi" });
    const figures = [...(section?.querySelectorAll("figure") ?? [])];
    expect(figures.map((figure) => figure.querySelector("blockquote")?.textContent)).toEqual([
      "”Lainaus 1”",
      "”Quote 2”",
    ]);
    expect(figures.map((figure) => figure.getAttribute("lang"))).toEqual([null, "en"]);
  });

  it("marks the quotes against the page's language inside a body shown in another", () => {
    // A Finnish page showing its English version: the body is marked en, so
    // the arrangement resets to fi, and the Finnish quote needs no mark of its own.
    const { container, section } = renderSection({ arrangement: "pair", locale: "fi", textLocale: "en" });
    expect(container.firstElementChild?.getAttribute("lang")).toBe("en");
    const figures = [...(section?.querySelectorAll("figure") ?? [])];
    expect(figures[0].closest("[lang]")?.getAttribute("lang")).toBe("fi");
    expect(figures.map((figure) => figure.getAttribute("lang"))).toEqual([null, "en"]);
  });
});
