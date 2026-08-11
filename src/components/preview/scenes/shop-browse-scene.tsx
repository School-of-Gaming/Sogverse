"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildBrowseCounts,
  buildBrowseFixture,
  SHOP_SCENE_AUDIENCES,
  SHOP_SCENE_DEFAULT,
  type ShopBrowseScenario,
} from "@/components/public/products/mock-detail-fixtures";
import { useNow } from "@/providers";
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

  // The fixtures are anchored once, on the first `useNow()` value, and held —
  // the same arrangement every other scene uses. The card keeps deriving its
  // state from the ticking clock; what is frozen is the calendar it derives
  // against, so a card cannot drift from open to ended while someone looks.
  const liveNow = useNow();
  const [anchorNow] = useState(() => liveNow);

  const { sections, counts, hrefById } = useMemo(() => {
    const products = slugs.map((slug) => ({
      slug,
      product: buildBrowseFixture(slug, anchorNow),
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
    return {
      sections: built,
      // Counts synthesized from each scenario's authored state, so a card's
      // derived fullness agrees with the label on its name.
      counts: products.map(({ slug, product }) =>
        buildBrowseCounts(slug, product.id),
      ),
      hrefById: hrefs,
    };
  }, [anchorNow, slugs, t, visible]);

  const productHref = useCallback(
    (id: string) => hrefById.get(id) ?? "#",
    [hrefById],
  );

  return (
    <ProductBrowseBody
      sections={sections}
      counts={counts}
      filters={{ initialSpokenLanguages: SPOKEN_LANGUAGES }}
      scopeHasProducts
      productHref={productHref}
    />
  );
}
