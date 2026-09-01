import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import sv from "@/../messages/sv.json";
import { ProductDetailPageBody } from "@/components/public/products/product-detail-page-body";
import {
  buildScenarioFixture,
  type PreviewScenario,
} from "@/components/public/products/mock-detail-fixtures";
import { NowProvider, TimezoneProvider } from "@/providers";
import type { ProductDetailRow } from "@/services/products";

/**
 * **The back link on `/schools/<slug>/[id]` names its municipality, and nothing
 * reads the locations table to find that name out.**
 *
 * The route hands the page a slug and nothing else; the name comes off the
 * product row's own embedded location, resolved up to its municipality and
 * localised for the viewer. So the two claims worth pinning are the ones a
 * reader of the page cannot tell apart from the old server-resolved version:
 * the label says the municipality's name **in the viewer's locale**, and the
 * href stays the slug that was in the URL rather than the canonical one.
 *
 * The third is the edge the derivation introduced: a club that resolves to no
 * municipality at all (legacy rows anchored at a region or a country) has no
 * name to show, and must fall back to the type's ordinary sibling link rather
 * than rendering "{empty} Clubs".
 */

// The global setup mocks `useSearchParams` as permanently empty, which cannot
// express the case this page now turns on: whether the reader arrived from a
// browse grid, and carrying which filters. Overridden here so a test can put a
// URL behind the link the way a card link would have.
const mockSearch = { value: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => mockSearch.value,
}));

/** Put a detail-page URL's query behind the next render. */
function arriveWith(query: string) {
  mockSearch.value = new URLSearchParams(query);
}

beforeEach(() => {
  // Cold arrival is the default, so a test that says nothing about how the
  // reader got here gets the case that has always existed.
  mockSearch.value = new URLSearchParams();
});

function renderBody(
  scenario: PreviewScenario,
  {
    municipalitySlug,
    locale = "en",
    locations,
  }: {
    municipalitySlug?: string;
    locale?: "en" | "sv";
    locations?: ProductDetailRow["locations"];
  },
) {
  const { product } = buildScenarioFixture(scenario);
  const row: ProductDetailRow =
    locations === undefined ? product : { ...product, locations };
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "sv" ? sv : en}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={new Date("2026-08-13T09:00:00Z")}>
          <ProductDetailPageBody
            product={row}
            municipalitySlug={municipalitySlug}
            signupPanel={<div data-testid="panel" />}
            signupActionable
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/**
 * The band renders the link once per breakpoint range (each copy hidden outside
 * its own), so this collapses the three copies to the one pair of values they
 * all carry — and fails loudly if they ever disagree.
 */
function backLink(container: HTMLElement): { href: string; text: string } {
  const links = [...container.querySelectorAll("a")].filter((a) =>
    /^\/(schools|shop)/.test(a.getAttribute("href") ?? ""),
  );
  expect(links.length).toBeGreaterThan(0);
  const hrefs = [...new Set(links.map((a) => a.getAttribute("href") ?? ""))];
  const texts = [...new Set(links.map((a) => a.textContent.trim()))];
  expect(hrefs).toHaveLength(1);
  expect(texts).toHaveLength(1);
  return { href: hrefs[0] ?? "", text: texts[0] ?? "" };
}

describe("the municipality back link on a club detail page", () => {
  it("names the municipality an in-person club's school site sits in", () => {
    // `muni-empty` is anchored at Tapiolan koulu, whose parent is Espoo — the
    // shape that a location-id comparison would miss entirely.
    const { container } = renderBody("muni-empty", {
      municipalitySlug: "espoo",
    });
    expect(backLink(container)).toEqual({
      href: "/schools/espoo",
      text: "Espoo Clubs",
    });
  });

  it("names the municipality an online club is anchored at directly", () => {
    // `muni-filling` is remote and points at the municipality row itself.
    const { container } = renderBody("muni-filling", {
      municipalitySlug: "espoo",
    });
    expect(backLink(container).text).toBe("Espoo Clubs");
  });

  it("renders the name in the viewer's locale, and leaves the URL's slug alone", () => {
    // Espoo carries `name_i18n.sv = "Esbo"`. A Swedish viewer reading the
    // Swedish heading is the case the old server read resolved with `getLocale`
    // — the derivation has to keep doing it.
    const { container } = renderBody("muni-empty", {
      municipalitySlug: "esbo",
      locale: "sv",
    });
    const { href, text } = backLink(container);
    expect(text).toContain("Esbo");
    expect(text).not.toContain("Espoo");
    // The href is the slug the viewer arrived through, never the canonical one.
    expect(href).toBe("/schools/esbo");
  });

  it("falls back to the sibling listing when the club resolves to no municipality", () => {
    const { container } = renderBody("muni-empty", {
      municipalitySlug: "espoo",
      locations: null,
    });
    // Label and destination both fall back: an empty "{name} Clubs" is not an
    // option, and the generic label pointed at one municipality's listing would
    // name a destination it does not go to.
    expect(backLink(container)).toEqual({
      href: "/shop",
      text: "Back to municipality clubs",
    });
  });

  it("is untouched on /shop/[id], where no slug is passed", () => {
    const { container } = renderBody("muni-empty", {});
    expect(backLink(container)).toEqual({
      href: "/shop",
      text: "Back to municipality clubs",
    });
  });

  it("carries the grid's filters back to the municipality listing", () => {
    arriveWith("from=browse&topic=minecraft&days=1");
    const { container } = renderBody("muni-empty", {
      municipalitySlug: "espoo",
    });
    // The slug still decides the path; the filters ride along on top of it.
    expect(backLink(container).href).toBe(
      "/schools/espoo?topic=minecraft&days=1",
    );
  });
});

/**
 * **Where the back link goes is where the reader was, not what they are looking
 * at.** A card link carries the grid's filter state into the detail URL, so the
 * listing is rebuilt from it — the reader lands on the grid they left, with no
 * Type selection they never made. Opened cold there is no state to return to,
 * and the type's own listing is the only sensible destination.
 */
describe("the shop back link's destination", () => {
  it("returns to an unfiltered shop rather than the type's listing", () => {
    // The reported bug: browsing an unfiltered /shop, opening a club and
    // pressing back used to land on ?category=clubs — a filter nobody chose.
    arriveWith("from=browse");
    const { container } = renderBody("consumer-club", {});
    expect(backLink(container).href).toBe("/shop");
  });

  it("restores every chip the grid was carrying", () => {
    arriveWith("from=browse&category=clubs&topic=minecraft&lang=en&days=1,3");
    const { container } = renderBody("consumer-club", {});
    expect(backLink(container).href).toBe(
      "/shop?category=clubs&topic=minecraft&lang=en&days=1%2C3",
    );
  });

  it("falls back to the type's listing when opened cold", () => {
    // No marker: a shared link, an unfurl or a search result. There is no grid
    // to go back to, so the label's own listing is the destination — the
    // behaviour this page has always had.
    const { container } = renderBody("consumer-club", {});
    expect(backLink(container)).toEqual({
      href: "/shop?category=clubs",
      text: "Back to clubs",
    });
  });

  it("ignores filter params with no marker beside them", () => {
    // A hand-edited or copied detail URL carrying chips but no marker is still
    // a cold arrival: the chips describe a grid this reader was never on.
    arriveWith("topic=minecraft");
    const { container } = renderBody("consumer-club", {});
    expect(backLink(container).href).toBe("/shop?category=clubs");
  });
});
