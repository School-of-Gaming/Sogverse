"use client";

import { useTranslations } from "next-intl";
import { productImageUrl } from "@/lib/images/product-image-url";
import type { ParticipationCounts } from "@/services/participations";
import type { ProductBrowseRow } from "@/types";
import { useBrowseCardViewProps } from "./product-browse-card";
import { ProductBrowseCardViewDraft } from "./product-browse-card-view-draft";
import { productTagLabelKey, type ProductTag } from "./product-tag";

/**
 * **The DRAFT browse card's adapter** — the shell around the draft body, and
 * the piece that dies at promotion. One body, two shells: the row→props
 * resolution is the *same* hook the live `ProductBrowseCard` calls, so the two
 * cards cannot describe the same product differently while the redesign is
 * being compared against the live grid. All this adds on top is the two facts
 * the draft body needs and the live one has no notion of — the tag's label and
 * a resolved image URL.
 *
 * When the redesign is promoted, `ProductBrowseCard` renders the draft body and
 * this file goes away: the tag arrives on the row like every other product
 * field, and the image override below has nothing left to override.
 */
interface ProductBrowseCardDraftProps {
  product: ProductBrowseRow;
  counts?: ParticipationCounts | null;
  detailHref?: string;
  municipalityScoped?: boolean;
  /**
   * Who the product is designed for. Passed in rather than read off the row
   * because there is no column for it yet — see `product-tag.ts`. Most
   * products carry none, which is the unremarkable case.
   */
  tag?: ProductTag | null;
  /**
   * Image URL override, and **the one thing here that exists purely for the
   * preview scene**: fixture rows carry `image_path: null` (no storage object
   * backs them), so a scene that let the row decide would render every card on
   * the fallback banner and the media block would go unjudged. The scene passes
   * local demo art from `public/preview/` instead.
   *
   * `undefined` means "no override, resolve the row" — which is what the live
   * shop would do, and what keeps this prop from being load-bearing. An
   * explicit `null` means "this card has no picture", which is how the scene
   * puts exactly one fallback banner on the grid. The whole prop dies at
   * promotion.
   */
  imageSrc?: string | null;
  variant: "overlay" | "chip-row";
}

export function ProductBrowseCardDraft({
  product,
  counts,
  detailHref,
  municipalityScoped = false,
  tag = null,
  imageSrc,
  variant,
}: ProductBrowseCardDraftProps) {
  const tTag = useTranslations("productTag");
  const viewProps = useBrowseCardViewProps(
    product,
    counts,
    detailHref,
    municipalityScoped,
  );

  return (
    <ProductBrowseCardViewDraft
      {...viewProps}
      tagLabel={tag === null ? null : tTag(productTagLabelKey(tag))}
      imageSrc={
        imageSrc !== undefined
          ? imageSrc
          : product.image_path === null
            ? null
            : productImageUrl(product.image_path)
      }
      variant={variant}
    />
  );
}
