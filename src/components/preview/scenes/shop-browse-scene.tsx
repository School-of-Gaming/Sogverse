"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildBrowseCounts,
  buildBrowseFixture,
  SHOP_SCENE_TAGGED_CATALOG,
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
import { previewSceneHref } from "../href";

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

/**
 * The shop storefront, over fixtures.
 *
 * It renders the same `ProductBrowseResults` the live `/shop` renders — the
 * body that owns the filter rail, the width budget, the headed grids and the
 * cards themselves. The live route's own shell does the fetching and the Type
 * narrowing above it; here the sections are handed over directly, which is the
 * one honest difference.
 *
 * The chip filters genuinely work: they live in the URL and `filterProducts`
 * runs client-side over these rows, so the audience and design-tag rows can be
 * toggled against a grid that actually answers — the one grid carries every tag
 * value, all three audiences, and a handful of products answering neither.
 *
 * Cards open the matching product-detail scene rather than `/shop/<id>`, which
 * no fixture id resolves to. Everything else about a card — its picture, its
 * tag, its audience — comes off the row.
 *
 * It takes no scenario, because there is one storefront grid and nothing
 * branches on the slug. The renderer still validates the URL segment against
 * `isShopBrowseScenario` before mounting this — that check is about what the
 * registry declares, not about what the body needs.
 */
export function ShopBrowseScene() {
  const t = useTranslations("productBrowse");
  // The Type row is an ordinary filter living in its own URL param, and the
  // live storefront expands an empty selection into every category before
  // handing sections down. Reading it here is what keeps those chips honest —
  // a rendered control that did nothing would be the scene simulating chrome
  // rather than composing it.
  const { categories } = useShopCategories();
  const visible = visibleCategories(categories);

  // The fixtures are anchored once, on the first `useNow()` value, and held —
  // the same arrangement every other scene uses. The card keeps deriving its
  // state from the ticking clock; what is frozen is the calendar it derives
  // against, so a card cannot drift from open to ended while someone looks.
  const liveNow = useNow();
  const [anchorNow] = useState(() => liveNow);

  const { sections, counts, hrefById } = useMemo(() => {
    const products = SHOP_SCENE_TAGGED_CATALOG.map((entry) => ({
      entry,
      product: buildBrowseFixture(entry.slug, anchorNow, {
        // The grid replaces both halves of a card's copy: real names, with the
        // scenario descriptor moved down into the description, so the titles
        // sit the way a real catalogue's would.
        name: entry.nameOverride,
        description: entry.descriptionOverride,
      }),
    }));
    // Fixture ids resolve to no real product, so a card must open its own
    // detail scene rather than `/shop/<id>`.
    const hrefs = new Map<string, string>(
      products.map(({ entry, product }) => [
        product.id,
        previewSceneHref("products", entry.slug),
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
      counts: products.map(({ entry, product }) =>
        buildBrowseCounts(entry.slug, product.id),
      ),
      hrefById: hrefs,
    };
  }, [anchorNow, t, visible]);

  const productHref = useCallback(
    (id: string) => hrefById.get(id) ?? "#",
    [hrefById],
  );

  return (
    <ProductBrowseBody
      sections={sections}
      counts={counts}
      scopeHasProducts
      productHref={productHref}
    />
  );
}
