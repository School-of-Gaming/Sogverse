"use client";

import { useTranslations } from "next-intl";
import { DraftTagChip } from "./product-browse-card-view-draft";
import { productTagLabelKey, type ProductTag } from "./product-tag";

/**
 * **The tag, explained** — the chip a family met on the card and the hero, plus
 * the sentence or two saying what SOG actually does about it.
 *
 * It exists because a chip on its own is a promise with no content behind it:
 * "Neuroinclusive" tells a parent the product claims something, not what the
 * claim is. The card and the hero carry the label because that is all a label
 * can do; this is the one place on either surface that answers it.
 *
 * **It belongs in the reading column, and that is the whole reason it is a
 * component of its own.** It first lived inside the overview card, which was
 * fine until the draft page moved that card into a 16rem facts rail from `2xl`
 * — where this paragraph gets about 191px, or twenty-seven characters a line,
 * roughly half a comfortable measure and eight or nine lines deep. Prose does
 * not belong in a facts rail. So the rail stays facts, and this sits under the
 * short description at the reading column's full width, which is also where a
 * parent who just read the chip on the picture looks next.
 *
 * Draft vocabulary for now — it renders `DraftTagChip`, and both want a proper
 * home together at promotion. The copy it prints is placeholder text: see the
 * `productTagDetail` marker in `product-tag.ts`.
 */
export function ProductTagNote({ tag }: { tag: ProductTag }) {
  const tTag = useTranslations("productTag");
  // DRAFT COPY. The product owner is writing the real source text and these
  // strings are placeholders that get replaced wholesale, in every locale.
  const tTagDetail = useTranslations("productTagDetail");
  const key = productTagLabelKey(tag);

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <DraftTagChip tag={{ value: tag, label: tTag(key) }} />
      <p className="text-sm text-muted-foreground">{tTagDetail(key)}</p>
    </div>
  );
}
