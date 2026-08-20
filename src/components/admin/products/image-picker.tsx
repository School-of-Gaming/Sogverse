"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ProductBanner } from "@/components/ui/product-banner";
import { productImageSrc } from "@/lib/images/product-image-url";

/**
 * The catalogue entry a product is pointing at, as far as this card is
 * concerned: enough to paint it and to name it, and nothing else.
 *
 * It is **derived, never form state**. The edit page gets it from the admin
 * product read's `product_images` embed; whatever surface changes the pick is
 * responsible for handing back the entry it changed to, so a rename or a
 * replace made elsewhere can never leave a stale label on this card.
 */
export interface ProductImageSelection {
  label: string;
  path: string;
}

interface ImagePickerProps {
  /** The selected entry's id, or null for a product with no picture. */
  imageId: string | null;
  /** That entry's label and path. `null` when nothing is selected — or when
   *  the caller has not resolved the selection yet, in which case the card
   *  shows the empty frame rather than guessing. */
  current: ProductImageSelection | null;
  /** Commit a different entry, or `null` to take the picture off this
   *  product. The only write this card makes to form state. */
  onChange: (imageId: string | null) => void;
  disabled?: boolean;
}

/**
 * **Placeholder — the product form's image card, reduced to its seams.**
 *
 * The finished card opens the shared image catalogue: an admin browses the
 * entries, uploads a new one, renames, replaces or removes one, and drops a
 * file straight onto this card to select it for this product alone. None of
 * that is here yet. What is here is the shape everything else is already
 * written against, so the catalogue work is additive:
 *
 *   - `imageId` in, `onChange` out — the whole contract with form state.
 *   - `current` for the picture and the label, supplied by the caller.
 *   - **Change image** — inert. This is where the catalogue dialog opens.
 *   - **Remove** — live, and already final: it takes the picture off this
 *     product and touches nothing shared, so it never warns.
 *
 * Copy is borrowed from the keys the old file picker used; the catalogue's own
 * copy lands with the dialog, in every locale, and re-labels these two buttons
 * on its way past.
 */
export function ImagePicker({
  imageId,
  current,
  onChange,
  disabled,
}: ImagePickerProps) {
  const t = useTranslations("admin.products.imagePicker");

  // A `current` that belongs to some other id is worse than none: it would
  // paint the wrong picture with a straight face. Selection is the id.
  const selected = imageId === null ? null : current;

  return (
    <Field label={t("label")} hint={t("hint")}>
      <div className="rounded-md border border-input bg-background p-4">
        {/* The one 3:2 frame every product picture is painted in — the same
            component and the same crop the shop card uses, so what an admin
            approves here is what a family meets. `null` src is the frame's own
            no-picture state, at the same size, so the card does not change
            height when a picture is chosen. */}
        <ProductBanner
          src={productImageSrc(selected?.path)}
          sizes="240px"
          className="mx-auto w-60 rounded-md border"
        />

        {/* No reserved slot for the label: an unselected card has nothing to
            hold room for, and the only thing that fills it is the admin's own
            pick — which is allowed to move what sits below it. */}
        {selected && (
          <p className="mt-3 text-center text-sm text-muted-foreground">
            {selected.label}
          </p>
        )}

        <div className="mt-3 flex items-center justify-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled>
            {t("chooseFile")}
          </Button>
          {imageId !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              <X className="mr-1 h-4 w-4" />
              {t("remove")}
            </Button>
          )}
        </div>
      </div>
    </Field>
  );
}
