"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  buildBrowseFixture,
  SHOP_SCENE_AUDIENCES,
  SHOP_SCENE_DEFAULT,
} from "@/components/public/products/mock-detail-fixtures";
import { type ProductBrowseSection } from "@/components/public/products/product-browse-results";
import {
  ProductBrowseBody,
  sectionHeading,
} from "@/components/public/products/product-browse-page";
import {
  CATEGORY_TYPE,
  visibleCategories,
  type ShopCategory,
} from "@/components/public/products/shop-categories";
import { useShopCategories } from "@/components/public/products/use-shop-categories";
import type { SpokenLanguage } from "@/types";
import { previewSceneHref } from "../href";

/**
 * The shop storefront, over fixtures.
 *
 * It renders the same `ProductBrowseResults` the live `/shop` renders — the
 * body that owns the filter rail, the width budget, the headed grids and the
 * empty states. The live route's own shell does the fetching and the Type
 * narrowing above it; here the sections are handed over directly, which is the
 * one honest difference.
 *
 * The chip filters genuinely work: they live in the URL and `filterProducts`
 * runs client-side over these rows, so the audience row can be toggled against
 * a grid that actually answers. Cards open the matching product-detail scene
 * rather than `/shop/<id>`, which no fixture id resolves to.
 */
export const SHOP_BROWSE_SCENARIOS = ["default", "audiences"] as const;

export type ShopBrowseScenario = (typeof SHOP_BROWSE_SCENARIOS)[number];

export function isShopBrowseScenario(s: string): s is ShopBrowseScenario {
  return (SHOP_BROWSE_SCENARIOS as readonly string[]).includes(s);
}

/**
 * The reference set the Language chip row paints from.
 *
 * Passed as `initialData` exactly as the live page passes its server-prefetched
 * copy, so the row is on screen in the first frame instead of appearing after
 * its own fetch — which is the layout behaviour being judged.
 */
const SPOKEN_LANGUAGES: SpokenLanguage[] = [
  { code: "fi", name: "Suomi" },
  { code: "en", name: "English" },
  { code: "sv", name: "Svenska" },
];

/**
 * Which category a product type belongs under. Read from `CATEGORY_TYPE`
 * rather than restated, so a category that changes what it holds changes here
 * too.
 */
const ALL_CATEGORIES: readonly ShopCategory[] = ["clubs", "camps", "events"];

function categoryOf(productType: string): ShopCategory | undefined {
  return ALL_CATEGORIES.find(
    (category) => CATEGORY_TYPE[category] === productType,
  );
}

export function ShopBrowseScene({
  scenario,
}: {
  scenario: ShopBrowseScenario;
}) {
  const t = useTranslations("productBrowse");
  // The Type row is an ordinary filter living in its own URL param, and the
  // live storefront expands an empty selection into every category before
  // handing sections down. Reading it here is what keeps those chips honest —
  // a rendered control that did nothing would be the scene simulating chrome
  // rather than composing it.
  const { categories } = useShopCategories();
  const visible = visibleCategories(categories);

  const slugs =
    scenario === "audiences" ? SHOP_SCENE_AUDIENCES : SHOP_SCENE_DEFAULT;

  const { sections, hrefById } = useMemo(() => {
    const products = slugs.map((slug) => ({
      slug,
      product: buildBrowseFixture(slug),
    }));
    // Fixture ids resolve to no real product, so a card must open its own
    // detail scene rather than `/shop/<id>`.
    const hrefs = new Map<string, string>(
      products.map(({ slug, product }) => [
        product.id,
        previewSceneHref("products", slug),
      ]),
    );
    const built: ProductBrowseSection[] = visible.map((category) => ({
      id: category,
      heading: sectionHeading(t, category),
      products: products
        .filter(({ product }) => categoryOf(product.product_type) === category)
        .map(({ product }) => product),
    }));
    return { sections: built, hrefById: hrefs };
  }, [slugs, t, visible]);

  const productHref = useCallback(
    (id: string) => hrefById.get(id) ?? "#",
    [hrefById],
  );

  return (
    <ProductBrowseBody
      sections={sections}
      counts={[]}
      filters={{ initialSpokenLanguages: SPOKEN_LANGUAGES }}
      scopeHasProducts
      productHref={productHref}
    />
  );
}
