"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildBrowseCounts,
  buildBrowseFixture,
  SHOP_SCENE_AUDIENCES,
  SHOP_SCENE_DEFAULT,
  SHOP_SCENE_TAGGED_CATALOG,
  type PreviewScenario,
  type ShopBrowseScenario,
  type ShopCatalogEntry,
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
 * The reference set the Language chip row paints from.
 *
 * Passed as `initialData` exactly as the live page passes its server-prefetched
 * copy, so the row is on screen in the first frame instead of appearing after
 * its own fetch — which is the layout behaviour being judged.
 *
 * This list mirrors the `spoken_languages` reference table and has to track
 * it: it was once authored as fi/en/sv, the DB later gained French, and the
 * scene's filter row silently fell out of step with the live shop's until
 * someone compared them side by side. When a language is added to the table,
 * add it here in the same change.
 */
const SPOKEN_LANGUAGES: SpokenLanguage[] = [
  { code: "fi", name: "Finnish" },
  { code: "en", name: "English" },
  { code: "sv", name: "Swedish" },
  { code: "fr", name: "French" },
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

/**
 * A comparison grid's entries: a slug and nothing else. The tagged-catalog grid
 * adds the copy overrides, which `SHOP_SCENE_TAGGED_CATALOG` carries; giving
 * both shapes one type is what keeps the fixture build below a single path. The
 * tag and the picture are *not* here — they are row fields on the fixture, so
 * the detail page a card opens shows the same two things.
 */
type SceneEntry = ShopCatalogEntry | { slug: PreviewScenario };

/** Whether this entry carries the tagged-catalog grid's copy overrides. */
function hasCopyOverride(entry: SceneEntry): entry is ShopCatalogEntry {
  return "nameOverride" in entry;
}

function entriesFor(scenario: ShopBrowseScenario): readonly SceneEntry[] {
  switch (scenario) {
    case "default":
      return SHOP_SCENE_DEFAULT.map((slug) => ({ slug }));
    case "audiences":
      return SHOP_SCENE_AUDIENCES.map((slug) => ({ slug }));
    case "tagged-catalog":
      return SHOP_SCENE_TAGGED_CATALOG;
  }
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
 * toggled against a grid that actually answers — the tagged-catalog scenario is
 * the one that answers the tag row properly, carrying every tag value and a
 * handful of untagged products beside them.
 *
 * Cards open the matching product-detail scene rather than `/shop/<id>`, which
 * no fixture id resolves to. Everything else about a card — its picture, its
 * tag, its audience — comes off the row, so the three scenarios differ only in
 * which rows they put on the grid.
 */
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

  // Memoised because the comparison scenarios build their entry list on the
  // fly: a fresh array every render would re-run the fixture build below with
  // it.
  const entries = useMemo(() => entriesFor(scenario), [scenario]);

  // The fixtures are anchored once, on the first `useNow()` value, and held —
  // the same arrangement every other scene uses. The card keeps deriving its
  // state from the ticking clock; what is frozen is the calendar it derives
  // against, so a card cannot drift from open to ended while someone looks.
  const liveNow = useNow();
  const [anchorNow] = useState(() => liveNow);

  const { sections, counts, hrefById } = useMemo(() => {
    const products = entries.map((entry) => ({
      entry,
      product: buildBrowseFixture(
        entry.slug,
        anchorNow,
        // The tagged-catalog grid replaces both halves of a card's copy: real
        // names, with the scenario descriptor moved down into the description.
        // The comparison grids keep the ` · label` suffix they have always had.
        hasCopyOverride(entry)
          ? { name: entry.nameOverride, description: entry.descriptionOverride }
          : undefined,
      ),
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
  }, [anchorNow, entries, t, visible]);

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
