"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Images, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ProductBanner } from "@/components/ui/product-banner";
import { productImageSrc } from "@/lib/images/product-image-url";
import { cn } from "@/lib/utils";
import {
  PRODUCT_IMAGE_ACCEPT,
  useUploadProductImage,
} from "@/services/product-images";
import { ImageCatalogueDialog } from "./image-catalogue-dialog";
import { productImageErrorMessage } from "./product-image-error";
import type {
  ProductImageEntry,
  ProductImageSelection,
} from "./product-image-selection";

interface ImagePickerProps {
  /** The selected entry's id, or null for a product with no picture. */
  imageId: string | null;
  /** That entry's label and path. `null` when nothing is selected — or when
   *  the caller has not resolved the selection yet, in which case the card
   *  shows the empty frame rather than guessing. */
  current: ProductImageSelection | null;
  /**
   * The pick changed. Both halves travel together — the id the form saves and
   * the picture the card paints — so the two can never disagree. `null` for
   * both is "this product has no picture".
   */
  onChange: (
    imageId: string | null,
    image: ProductImageSelection | null,
  ) => void;
  disabled?: boolean;
}

/**
 * **The product form's picture card.**
 *
 * A product does not have a file; it points at an entry in a catalogue every
 * product shares. So this card does two different things and keeps them
 * visibly apart:
 *
 *   - **Change image** opens the catalogue, where an entry can be browsed,
 *     renamed, replaced or retired. Those verbs reach every product using the
 *     entry, which is why they live behind a dialog that can show that reach.
 *   - **Remove from this product** and a **dropped file** touch this product
 *     and nothing else. Remove never warns, because there is nothing to warn
 *     about; a drop adds the file to the catalogue (or finds the entry that
 *     already holds those exact bytes) and selects the result *here*, which is
 *     the whole reason a drop is safe. A drop is never a shared action.
 *
 * **The outcome slot under the card is reserved**, because it is the only place
 * that says which of "added" and "already in the catalogue" happened — the two
 * look identical otherwise, and the second one is the dedup doing its job
 * rather than anything going wrong. Reserving one line keeps the buttons above
 * it still while the answer arrives.
 *
 * The catalogue dialog is **mounted on the open state, not passed an `open`
 * prop**: it holds the two catalogue reads, and an edit page whose picture
 * nobody touches must not pay for them.
 */
export function ImagePicker({
  imageId,
  current,
  onChange,
  disabled,
}: ImagePickerProps) {
  const t = useTranslations("admin.products.imagePicker");
  const tError = useTranslations("admin.products.imageCatalogue.errors");
  const upload = useUploadProductImage();

  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<
    { kind: "added" | "existing" } | { kind: "error"; message: string } | null
  >(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // A `current` that belongs to some other id is worse than none: it would
  // paint the wrong picture with a straight face. Selection is the id.
  const selected = imageId === null ? null : current;

  function apply(entry: ProductImageEntry | null) {
    onChange(entry?.id ?? null, entry ? { label: entry.label, path: entry.path } : null);
  }

  async function addFile(file: File) {
    setUploading(true);
    setOutcome(null);
    try {
      const { status, image } = await upload.mutateAsync({ file });
      apply({ id: image.id, label: image.label, path: image.path });
      setOutcome({ kind: status });
    } catch (err) {
      setOutcome({
        kind: "error",
        message: productImageErrorMessage(err, tError),
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Field label={t("label")} hint={t("hint")}>
      <div
        onDragOver={(e) => {
          if (disabled || uploading) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (disabled || uploading) return;
          // `.item(0)` rather than `[0]`: the index signature is typed as
          // always-present, so an empty drop would hand `addFile` an undefined
          // it believes is a File. `item` answers null, which is the truth.
          const file = e.dataTransfer.files.item(0);
          if (file) void addFile(file);
        }}
        className={cn(
          "rounded-md border border-border bg-background p-4 transition-colors",
          dragging && "border-primary bg-primary/5",
        )}
      >
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
          <p className="mt-3 break-words text-center text-sm text-muted-foreground">
            {selected.label}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setCatalogueOpen(true)}
          >
            <Images className="h-4 w-4" />
            {t("change")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? t("uploading") : t("chooseFile")}
          </Button>
          {imageId !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => apply(null)}
            >
              <X className="h-4 w-4" />
              {t("remove")}
            </Button>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t("dropPrompt")} {t("formats")}
        </p>

        <input
          ref={fileInput}
          type="file"
          accept={PRODUCT_IMAGE_ACCEPT}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Cleared before the request, so re-choosing the same file after a
            // refusal still fires a change event.
            e.target.value = "";
            if (file) void addFile(file);
          }}
        />
      </div>

      {/* Reserved one-line slot. Held open from first paint so the answer
          landing does not push the form's next field down. */}
      <p
        className={cn(
          "min-h-[1.25rem] text-center text-xs",
          outcome?.kind === "error"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
        role="status"
      >
        {uploading && t("uploading")}
        {!uploading && outcome?.kind === "added" && t("outcomeAdded")}
        {!uploading && outcome?.kind === "existing" && t("outcomeExisting")}
        {!uploading && outcome?.kind === "error" && outcome.message}
      </p>

      {catalogueOpen && (
        <ImageCatalogueDialog
          productImageId={imageId}
          onSelect={apply}
          onEntryChanged={apply}
          onClose={() => setCatalogueOpen(false)}
        />
      )}
    </Field>
  );
}
