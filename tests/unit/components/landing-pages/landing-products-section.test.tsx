import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import productBrowse from "@/../messages/en/productBrowse.json";
import richText from "@/../messages/en/richText.json";
import type { LandingSection, LandingSectionTexts } from "@/lib/landing-pages/sections";
import type { ProductBrowseRow } from "@/types";

/**
 * **A landing page's products section, through the one body the live page and
 * the preview render.** The admin's picks are drawn as the shop's own cards,
 * in the admin's order, while the listing of every product type holds them —
 * a municipality club included: a pick the listing no longer holds is simply
 * not drawn, and a section none of whose picks is listed draws nothing at
 * all — no heading, no empty state.
 *
 * The card is a stub naming its product, so what is pinned is which rows
 * reach the shop's card; the card's own rendering is its own tests'.
 */
vi.mock("@/components/public/products/product-browse-card", () => ({
  ProductBrowseCard: ({ product }: { product: ProductBrowseRow }) => (
    <article data-product={product.id}>{product.product_translations[0]?.name}</article>
  ),
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.test");

import { LandingPageBody } from "@/components/landing-pages/landing-page-body";
import { SHOP_PRODUCT_TYPES } from "@/components/public/products/shop-categories";
import { LANDING_PRODUCT_TYPES } from "@/lib/landing-pages/sections";
import { productKeys } from "@/services/products/products.keys";
import { browseRow, emptyCounts } from "../../../mocks/product-browse-row";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HERO = id(1);
const PICKS = id(2);
const MORE = id(3);
const P = (n: number) => id(100 + n);

let renderedClient: QueryClient | undefined;

function renderPage(
  sections: LandingSection[],
  texts: LandingSectionTexts,
  listing: ProductBrowseRow[],
) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  renderedClient = client;
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ productBrowse, richText }}>
        <LandingPageBody
          sections={sections}
          imagePaths={{}}
          testimonials={{}}
          sectionTexts={texts}
          textLocale="en"
          locale="en"
          products={{ listing, counts: listing.map((row) => emptyCounts(row.id)) }}
          pageId={id(500)}
          preview={false}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const shown = () =>
  Array.from(document.querySelectorAll("article[data-product]")).map((card) =>
    card.getAttribute("data-product"),
  );

const hero: LandingSection = { id: HERO, type: "hero" };
const picks = (productIds: string[], sectionId = PICKS): LandingSection => ({
  id: sectionId,
  type: "products",
  background: "default",
  productIds,
});
const TEXTS: LandingSectionTexts = {
  [HERO]: { headline: "Clubs in Espoo" },
  [PICKS]: { eyebrow: "This term", heading: "Pick a club", intro: "All online." },
};

describe("a landing page's products section", () => {
  it("draws every listed pick as the shop's card, in the admin's order, under its header", () => {
    renderPage([hero, picks([P(3), P(1), P(2)])], TEXTS, [P(1), P(2), P(3)].map((p) => browseRow(p)));
    expect(shown()).toEqual([P(3), P(1), P(2)]);
    expect(screen.getByRole("heading", { level: 2, name: "Pick a club" })).toBeTruthy();
    expect(screen.getByText("This term")).toBeTruthy();
    expect(screen.getByText("All online.")).toBeTruthy();
  });

  it("leaves out a pick the shop no longer lists", () => {
    renderPage([hero, picks([P(1), P(2), P(3)])], TEXTS, [P(3), P(1)].map((p) => browseRow(p)));
    expect(shown()).toEqual([P(1), P(3)]);
  });

  it("draws nothing at all when none of its picks is listed", () => {
    renderPage([hero, picks([P(1), P(2)])], TEXTS, [browseRow(P(9))]);
    expect(shown()).toEqual([]);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.queryByText("This term")).toBeNull();
    expect(document.querySelectorAll("section")).toHaveLength(1);
  });

  it("draws a section with no words written as cards alone", () => {
    renderPage([hero, picks([P(1)])], { [HERO]: { headline: "Clubs" } }, [browseRow(P(1))]);
    expect(shown()).toEqual([P(1)]);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("draws a listed municipality club like any other pick", () => {
    renderPage(
      [hero, picks([P(1), P(2)])],
      TEXTS,
      [browseRow(P(1)), browseRow(P(2), { product_type: "municipality_club" })],
    );
    expect(shown()).toEqual([P(1), P(2)]);
  });

  it("seeds the listing of every product type under its own key, never the shop's", () => {
    renderPage([hero, picks([P(1)])], TEXTS, [browseRow(P(1))]);
    expect(renderedClient?.getQueryData(productKeys.visibleByTypes(LANDING_PRODUCT_TYPES))).toEqual([
      browseRow(P(1)),
    ]);
    expect(renderedClient?.getQueryData(productKeys.visibleByTypes(SHOP_PRODUCT_TYPES))).toBeUndefined();
  });

  it("draws each products section from the one page listing, by its own picks", () => {
    renderPage(
      [hero, picks([P(1)]), picks([P(2), P(1)], MORE)],
      TEXTS,
      [P(1), P(2)].map((p) => browseRow(p)),
    );
    expect(shown()).toEqual([P(1), P(2), P(1)]);
  });
});
