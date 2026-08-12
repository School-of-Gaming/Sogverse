"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildBrowseCounts,
  buildBrowseFixture,
  SHOP_SCENE_AUDIENCES,
  SHOP_SCENE_DEFAULT,
  SHOP_SCENE_REDESIGN,
  scenarioArt,
  scenarioTag,
  type PreviewScenario,
  type ShopBrowseScenario,
  type ShopRedesignEntry,
} from "@/components/public/products/mock-detail-fixtures";
import { useNow } from "@/providers";
import { type ProductBrowseSection } from "@/components/public/products/product-browse-results";
import {
  ProductBrowseBody,
  sectionHeading,
} from "@/components/public/products/product-browse-page";
import { ProductBrowseCardDraft } from "@/components/public/products/product-browse-card-draft";
import type { ProductTag } from "@/components/public/products/product-tag";
import {
  CATEGORY_TYPE,
  visibleCategories,
  type ShopCategory,
} from "@/components/public/products/shop-categories";
import { useShopCategories } from "@/components/public/products/use-shop-categories";
import type { ParticipationCounts } from "@/services/participations";
import type { ProductBrowseRow, SpokenLanguage } from "@/types";
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
 *
 * The `redesign` scenario is the exception to "the scene renders the live
 * body": it renders the *draft* browse card in the same grid, which is the
 * one-body-two-shells rule doing its job — the draft body is what will replace
 * the live card's, and it is being judged as a page first. The filter chips
 * keep working there too, because they run over the rows' real fields; a
 * product's tag is not among them and is not filterable yet, which is expected
 * until the tag becomes a column.
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

/**
 * A live-card grid's entries: a slug and nothing else. The redesign grid adds
 * the copy overrides, which `SHOP_SCENE_REDESIGN` carries; giving both shapes
 * one type is what keeps the fixture build below a single path. The tag and the
 * demo art are *not* here — they come from the shared per-scenario maps, so the
 * detail page a card opens shows the same two things.
 */
type SceneEntry = ShopRedesignEntry | { slug: PreviewScenario };

/** Whether this entry carries the redesign grid's copy overrides. */
function isRedesign(entry: SceneEntry): entry is ShopRedesignEntry {
  return "nameOverride" in entry;
}

function entriesFor(scenario: ShopBrowseScenario): readonly SceneEntry[] {
  switch (scenario) {
    case "default":
      return SHOP_SCENE_DEFAULT.map((slug) => ({ slug }));
    case "audiences":
      return SHOP_SCENE_AUDIENCES.map((slug) => ({ slug }));
    case "redesign":
      return SHOP_SCENE_REDESIGN;
  }
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

  // Memoised because the live-card scenarios build their entry list on the fly:
  // a fresh array every render would re-run the fixture build below with it.
  const entries = useMemo(() => entriesFor(scenario), [scenario]);
  const isDraftGrid = scenario === "redesign";

  // The fixtures are anchored once, on the first `useNow()` value, and held —
  // the same arrangement every other scene uses. The card keeps deriving its
  // state from the ticking clock; what is frozen is the calendar it derives
  // against, so a card cannot drift from open to ended while someone looks.
  const liveNow = useNow();
  const [anchorNow] = useState(() => liveNow);

  const { sections, counts, hrefById, tagById, imageById } = useMemo(() => {
    const products = entries.map((entry) => ({
      entry,
      product: buildBrowseFixture(
        entry.slug,
        anchorNow,
        // The redesign grid replaces both halves of a card's copy: real names,
        // with the scenario descriptor moved down into the description. The
        // live-card grids keep the ` · label` suffix they have always had.
        isRedesign(entry)
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
      // The two facts the draft card needs and no row carries: the tag has no
      // column yet, and a fixture has no storage object to point an image at.
      // Both come from the shared per-scenario maps rather than from this
      // scene, so the detail page each card links to shows the same tag and the
      // same picture.
      tagById: new Map<string, ProductTag | null>(
        products.map(({ entry, product }) => [
          product.id,
          scenarioTag(entry.slug),
        ]),
      ),
      imageById: new Map<string, string | null>(
        products.map(({ entry, product }) => [
          product.id,
          scenarioArt(entry.slug),
        ]),
      ),
    };
  }, [anchorNow, entries, t, visible]);

  const productHref = useCallback(
    (id: string) => hrefById.get(id) ?? "#",
    [hrefById],
  );

  // Undefined on the live-card scenarios, which is what makes them render the
  // real `<ProductBrowseCard>` — see the `renderCard` seam's own note, which
  // this whole branch is removed alongside at promotion.
  const renderCard = useMemo(() => {
    if (!isDraftGrid) return undefined;
    function renderDraftCard(
      product: ProductBrowseRow,
      cardCounts: ParticipationCounts | null,
      detailHref: string | undefined,
      municipalityScoped: boolean | undefined,
    ) {
      return (
        <ProductBrowseCardDraft
          product={product}
          counts={cardCounts}
          detailHref={detailHref}
          municipalityScoped={municipalityScoped}
          tag={tagById.get(product.id) ?? null}
          imageSrc={imageById.get(product.id) ?? null}
        />
      );
    }
    return renderDraftCard;
  }, [imageById, isDraftGrid, tagById]);

  return (
    <ProductBrowseBody
      sections={sections}
      counts={counts}
      filters={{ initialSpokenLanguages: SPOKEN_LANGUAGES }}
      scopeHasProducts
      productHref={productHref}
      renderCard={renderCard}
    />
  );
}
