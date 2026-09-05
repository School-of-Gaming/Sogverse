"use client";

import { useTranslations } from "next-intl";
import { TagGlyph } from "./product-chips";
import { productTagLabelKey, type ProductTag } from "./product-tag";

/**
 * **The tag, explained** — the sentence or two saying what SOG actually does
 * about the chip a family met on the card and the hero.
 *
 * It exists because a chip on its own is a promise with no content behind it:
 * "Neuroinclusive" tells a parent the product claims something, not what the
 * claim is. The card and the hero carry the label because that is all a label
 * can do; this is the one place on either surface that answers it.
 *
 * **It deliberately does NOT render the pill again.** The hero's chip sits an
 * inch above this block, and a second identical pill read as double-labeling
 * (owner-flagged). Instead the note leads with the tag's icon and name as
 * inline text — the definition of the chip, not another badge — with the em
 * dash as a CSS pseudo-element so the joining stays out of the message files.
 *
 * **It belongs in the reading column, and that is the whole reason it is a
 * component of its own.** It first lived inside the overview card, which was
 * fine until the page moved that card into a 16rem facts rail from `2xl` —
 * where this paragraph gets about 191px, or twenty-seven characters a line,
 * roughly half a comfortable measure and eight or nine lines deep. Prose does
 * not belong in a facts rail. So the rail stays facts, and this sits under the
 * short description at the reading column's full width, which is also where a
 * parent who just read the chip on the picture looks next.
 *
 * The glyph comes from the shared chip vocabulary (`product-chips.tsx`), which
 * is what keeps the icon here and the icon in the hero's pill on one map. The
 * copy it prints is the owner's own: see the `productTagDetail` marker in
 * `product-tag.ts` for the decisions inside it.
 *
 * Takes a non-null tag: an untagged product renders no note at all, and the
 * caller decides that before it gets here.
 */
export function ProductTagNote({ tag }: { tag: ProductTag }) {
  const tTag = useTranslations("productTag");
  const tTagDetail = useTranslations("productTagDetail");
  const key = productTagLabelKey(tag);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground after:mx-1.5 after:font-normal after:text-muted-foreground/50 after:content-['—']">
          <TagGlyph
            tag={tag}
            className="-mt-0.5 mr-1.5 inline h-4 w-4 text-primary"
          />
          {tTag(key)}
        </span>
        {tTagDetail(key)}
      </p>
    </div>
  );
}
