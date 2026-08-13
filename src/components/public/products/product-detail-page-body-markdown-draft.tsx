"use client";

import { LongDescriptionMarkdown } from "./long-description";
import {
  ProductDetailPageBody,
  type ProductDetailPageBodyProps,
} from "./product-detail-page-body";

/**
 * **The draft product detail page: the same body, with a markdown long
 * description.**
 *
 * The long description is becoming markdown, and the one question the change
 * cannot answer on its own is how loud its headings should be — which is a
 * question about the page, at the page's width, with the hero and the signup
 * rail beside it. So the preview scene needs a body that renders the new format
 * and is otherwise identical to the live one.
 *
 * **It is a wrapper rather than a copy, and that is the whole point.** The live
 * body is a hand-placed grid whose track counts, header band and rail spans are
 * mirrored between two breakpoints and counted by hand; duplicating it to
 * change one card would fork four hundred lines of layout to alter three, and
 * the fork is exactly what a draft body is supposed to avoid. The live body
 * takes the blurb as an optional slot instead, defaulted to the stored block
 * array, so nothing about the live route changes and this file is the one place
 * that says "render it as markdown".
 *
 * **It is temporary by construction.** The markdown source is a prop here
 * because the column still holds blocks — there is nowhere on the row to read
 * it from yet. When the column changes type, the live body reads the field
 * directly, the slot and its default collapse into a single line there, and
 * this file is deleted. A wrapper that outlives that step is a second page.
 */
export function ProductDetailPageBodyMarkdownDraft({
  longDescriptionMarkdown,
  ...bodyProps
}: ProductDetailPageBodyProps & {
  /** The blurb, as the stored value will look once the column is markdown. */
  longDescriptionMarkdown: string;
}) {
  return (
    <ProductDetailPageBody
      {...bodyProps}
      longDescription={
        <LongDescriptionMarkdown markdown={longDescriptionMarkdown} />
      }
    />
  );
}
