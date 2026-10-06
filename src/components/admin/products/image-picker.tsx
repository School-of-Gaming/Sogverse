"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Images, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ProductBanner } from "@/components/ui/product-banner";
import { LibraryCover } from "@/components/library/library-cover";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import { cn } from "@/lib/utils";
import { FramedImage } from "@/components/ui/framed-image";
import {
  useUploadCatalogueImage,
} from "@/services/catalogue-images";
import type { CatalogueImagePurpose } from "@/types";
import { CATALOGUE_COPY } from "./catalogue-copy";
import { useCatalogueCrop } from "./catalogue-crop";
import { ImageCatalogueDialog } from "./image-catalogue-dialog";
import { catalogueImageErrorMessage } from "./catalogue-image-error";
import type {
  CatalogueImageEntry,
  ProductImageSelection,
} from "./product-image-selection";

/**
 * The frame a purpose's pick is painted in — the same component the purpose's
 * readers meet it through, so what an admin approves here is what a family or
 * a reader sees — and the fixed width it takes in the form. The widths give
 * the ratios about the same weight on the page: a 3:2 product picture at
 * 240px and a 16:9 cover or landing picture at 288px stand the same height.
 */
const PICKER_FRAMES = {
  product: { Frame: ProductBanner, width: "w-60", sizes: "240px" },
  library_cover: { Frame: LibraryCover, width: "w-72", sizes: "288px" },
  landing_image: { Frame: LandingImageFrame, width: "w-72", sizes: "288px" },
} as const satisfies Record<
  CatalogueImagePurpose,
  {
    Frame: typeof ProductBanner | typeof LibraryCover | typeof LandingImageFrame;
    width: string;
    sizes: string;
  }
>;

/** A landing page picture in its purpose's 16:9 frame. */
function LandingImageFrame({
  src,
  className,
  sizes,
}: {
  src: string | null;
  className?: string;
  sizes?: string;
}) {
  return (
    <FramedImage purpose="landing_image" src={src} className={className} sizes={sizes} />
  );
}

interface ImagePickerProps {
  /** Which catalogue the pick comes from, and so the frame, the crop and the
   *  words the card uses. */
  purpose: CatalogueImagePurpose;
  /** The field's label and hint, which name what the picture is for. */
  label: string;
  hint: string;
  optional?: boolean;
  /** The selected entry's id, or null for no picture. */
  imageId: string | null;
  /** That entry's label and path. `null` when nothing is selected — or when
   *  the caller has not resolved the selection yet, in which case the card
   *  shows the empty frame rather than guessing. */
  current: ProductImageSelection | null;
  /**
   * The pick changed. Both halves travel together — the id the form saves and
   * the picture the card paints — so the two can never disagree. `null` for
   * both is "no picture".
   */
  onChange: (
    imageId: string | null,
    image: ProductImageSelection | null,
  ) => void;
  disabled?: boolean;
}

/**
 * **The form field that picks one entry of the shared image catalogue** — a
 * product's picture or a Library article's cover, by `purpose`.
 *
 * A product or an article does not have a file; it points at an entry in a
 * catalogue shared by everything of its purpose. So this card does two
 * different things and keeps them visibly apart:
 *
 *   - **Change** opens the catalogue, where an entry can be browsed, renamed,
 *     replaced or retired. Those verbs reach everything using the entry, which
 *     is why they live behind a dialog that can show that reach.
 *   - **Remove** and a **chosen or dropped file** touch this one product or
 *     article and nothing else. Remove never warns, because there is nothing
 *     to warn about; a file is cropped to the purpose's frame and added to the
 *     catalogue (or finds the entry that already holds those exact bytes) and
 *     selects the result *here*, which is the whole reason a drop is safe. A
 *     drop is never a shared action.
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
  purpose,
  label,
  hint,
  optional,
  imageId,
  current,
  onChange,
  disabled,
}: ImagePickerProps) {
  const t = useTranslations("admin.products.imagePicker");
  const tError = useTranslations("admin.products.imageCatalogue.errors");
  const upload = useUploadCatalogueImage();
  const copy = CATALOGUE_COPY[purpose];
  const { Frame, width, sizes } = PICKER_FRAMES[purpose];

  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<
    { kind: "added" | "existing" } | { kind: "error"; message: string } | null
  >(null);
  // A `current` that belongs to some other id is worse than none: it would
  // paint the wrong picture with a straight face. Selection is the id.
  const selected = imageId === null ? null : current;

  function apply(entry: CatalogueImageEntry | null) {
    onChange(entry?.id ?? null, entry ? { label: entry.label, path: entry.path } : null);
  }

  async function addFile(file: File) {
    setUploading(true);
    setOutcome(null);
    try {
      const { status, image } = await upload.mutateAsync({ file, purpose });
      apply({ id: image.id, label: image.label, path: image.path });
      setOutcome({ kind: status });
    } catch (err) {
      setOutcome({
        kind: "error",
        message: catalogueImageErrorMessage(err, tError),
      });
    } finally {
      setUploading(false);
    }
  }

  // A picked or dropped file is cropped to the purpose's frame before it is
  // added: the upload route takes nothing else.
  const crop = useCatalogueCrop(purpose, (file) => {
    void addFile(file);
  });

  return (
    <Field label={label} hint={hint} optional={optional}>
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
          if (file) crop.crop(file);
        }}
        className={cn(
          "rounded-md border border-border bg-background p-4 transition-colors",
          dragging && "ring-2 ring-act",
        )}
      >
        {/* The purpose's one frame, with the crop its readers meet. `null`
            src is the frame's own no-picture state, at the same size, so the
            card does not change height when a picture is chosen. */}
        <Frame
          src={catalogueImageSrc(purpose, selected?.path)}
          sizes={sizes}
          className={cn("mx-auto rounded-md border border-border", width)}
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
            {t(`${copy}.change`)}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={crop.choose}
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
              {t(`${copy}.remove`)}
            </Button>
          )}
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">
          {t(`${copy}.dropPrompt`)} {t("formats")}
        </p>

        {crop.element}
      </div>

      {/* Reserved one-line slot. Held open from first paint so the answer
          landing does not push the form's next field down. */}
      <p
        className="flex min-h-[1.25rem] items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"
        role="status"
      >
        {!uploading && outcome?.kind === "error" && (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
        )}
        {uploading && t("uploading")}
        {!uploading && outcome?.kind === "added" && t(`${copy}.outcomeAdded`)}
        {!uploading && outcome?.kind === "existing" && t(`${copy}.outcomeExisting`)}
        {!uploading && outcome?.kind === "error" && outcome.message}
      </p>

      {catalogueOpen && (
        <ImageCatalogueDialog
          purpose={purpose}
          currentImageId={imageId}
          onSelect={apply}
          onEntryChanged={apply}
          onClose={() => setCatalogueOpen(false)}
        />
      )}
    </Field>
  );
}
