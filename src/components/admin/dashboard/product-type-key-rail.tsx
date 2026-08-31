"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  PRODUCT_TYPE_ORDER,
  PRODUCT_TYPE_PRESENTATION,
} from "./product-type-presentation";

/**
 * The key to the one thing on this page that is a colour rather than a word: the
 * tinted product-type glyph.
 *
 * **It is a rail, not a row, because it belongs to the page rather than to a
 * section.** The same tinted glyph appears on a product card in the queue, a
 * chip in the week rows, a filter chip and a line in the coming-up feed; a
 * legend sitting under one of those would be explaining a grammar three other
 * sections also speak, and a reader who met the glyph first in the queue would
 * have to scroll past everything to find out what it meant. Sticky beside the
 * whole column, it is in the corner of the eye wherever the reader happens to
 * be — which is the only place a key is any use. It is also the *only* key on
 * the page: a second one inside the Schedule section would be explaining, twice,
 * the vocabulary of a mark that is not local to it.
 *
 * The geometry follows the shop's filter rail exactly (`sticky` under the
 * header via `--header-height`, `self-start` so a stretched grid item does not
 * defeat the stick, its own scroll if it ever outgrows the viewport). Two things
 * are deliberately cheap: it is eleven rem wide, which is narrow enough that the
 * card grid keeps three columns and a week row loses about one wrapped line at
 * the widths admins work at; and below `xl` it stops being a rail at all and
 * lays its entries out in a wrapping row at the *end* of the page, where a key
 * you consult belongs when there is no margin to put it in.
 *
 * **Type is the only thing here, and that is the target rather than an
 * omission.** The attention marker had an entry until it stopped needing one:
 * it was a bare amber dot, and a dot has no meaning a key can be avoided for.
 * It is now the alert triangle the family surfaces already use to say something
 * is wrong, which reads on sight and carries its own words in a tooltip. Every
 * other mark on the page is a glyph beside its own label. A key that has to
 * explain three things is a page that has failed to speak; this one is down to
 * the single thing that genuinely cannot be inferred, which is what a colour is.
 */
export function ProductTypeKeyRail() {
  const t = useTranslations("admin.dashboard.productTypeKey");
  const tType = useTranslations("admin.products.types");

  return (
    <aside
      aria-label={t("label")}
      className="mt-6 xl:mt-0 xl:sticky xl:top-[calc(var(--header-height)+1.5rem)] xl:max-h-[calc(100vh-var(--header-height)-3rem)] xl:self-start xl:overflow-y-auto"
    >
      <div className="rounded-lg border border-border bg-card p-3">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">
          {t("heading")}
        </h2>

        <ul className="flex flex-wrap gap-x-4 gap-y-2 xl:flex-col xl:gap-2">
          {PRODUCT_TYPE_ORDER.map((productType) => {
            const presentation = PRODUCT_TYPE_PRESENTATION[productType];
            const Icon = presentation.icon;
            return (
              <li
                key={productType}
                className="flex items-center gap-2 text-xs leading-tight"
              >
                {/* The tile is the swatch and the glyph is the icon, in one
                    mark — which is the whole convention this key exists to
                    teach. Two separate elements would say the same thing twice
                    and imply they were two facts. */}
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-md",
                    presentation.tint,
                  )}
                >
                  <Icon
                    className={cn("h-4 w-4", presentation.text)}
                    aria-hidden
                  />
                </span>
                <span className="min-w-0">
                  {tType(`${presentation.i18nKey}.plural`)}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
