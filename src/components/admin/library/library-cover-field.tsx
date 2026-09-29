"use client";

import { useState } from "react";
import { Images, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { LibraryCover } from "@/components/library/library-cover";
import { ImageCatalogueDialog } from "@/components/admin/products/image-catalogue-dialog";
import type { CatalogueImageEntry } from "@/components/admin/products/product-image-selection";
import { catalogueImageSrc } from "@/lib/images/catalogue-image-url";
import type { LibraryArticleCover } from "./library-article-form";

/**
 * **An article's cover: a Library cover entry of the shared image catalogue, or none.**
 *
 * The frame is `LibraryCover`, the one a reader meets on the article and its
 * card, so an empty cover shows the same NO IMAGE placeholder they would see.
 *
 * Choosing, uploading and cropping all happen inside the shared image
 * catalogue, opened for Library covers. The dialog is mounted only while it is
 * open, so an article whose cover nobody touches
 * never pays for the catalogue's reads. Nothing is uploaded when the article
 * is saved: the article links the chosen entry's id.
 *
 * **Remove touches this article alone**, and so never warns. What the
 * catalogue does to an entry — a replace, a removal — reaches every article
 * using it, live ones included; the dialog says so where it is asked.
 */
export function LibraryCoverField({
  cover,
  onChange,
  disabled,
}: {
  cover: LibraryArticleCover | null;
  onChange: (cover: LibraryArticleCover | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("admin.library");
  const [catalogueOpen, setCatalogueOpen] = useState(false);

  const apply = (entry: CatalogueImageEntry | null) =>
    onChange(entry === null ? null : { id: entry.id, path: entry.path });

  return (
    <Field label={t("fields.cover")} optional hint={t("hints.cover")}>
      <div className="space-y-3">
        <LibraryCover
          src={catalogueImageSrc("library_cover", cover?.path)}
          sizes="(min-width: 640px) 448px, 100vw"
          className="w-full max-w-md rounded-md border border-border"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setCatalogueOpen(true)}
          >
            <Images className="h-4 w-4" />
            {cover === null ? t("cover.choose") : t("cover.change")}
          </Button>
          {cover !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              <X className="h-4 w-4" />
              {t("cover.remove")}
            </Button>
          )}
        </div>
      </div>

      {catalogueOpen && (
        <ImageCatalogueDialog
          purpose="library_cover"
          currentImageId={cover?.id ?? null}
          onSelect={apply}
          onEntryChanged={apply}
          onClose={() => setCatalogueOpen(false)}
        />
      )}
    </Field>
  );
}
