"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, Pencil, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ProductBanner } from "@/components/ui/product-banner";
import { productImageSrc } from "@/lib/images/product-image-url";
import { cn } from "@/lib/utils";
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_LABEL_MAX_LENGTH,
  productImageLabel,
  type ProductImageUsage,
  type ProductImageUser,
} from "@/services/product-images";
import type { ProductImage } from "@/types";
import {
  ImageActionConfirmDialog,
  type ImageCatalogueAction,
} from "./image-catalogue-confirm";
import { ProductImageUserList } from "./image-catalogue-user-list";
import { productImageErrorMessage } from "./product-image-error";

export interface ImageCatalogueViewProps {
  /** The catalogue, newest first. `undefined` while the read is in flight. */
  images: ProductImage[] | undefined;
  /** Which products reach which entry. `undefined` while the read is in flight. */
  usage: ProductImageUsage | undefined;
  /** The entry filling the reference column, or null for the empty column. */
  selectedId: string | null;
  /** A tile was clicked. */
  onSelectTile: (id: string) => void;
  /** Commit this entry to the product being edited, and close. */
  onUse: (image: ProductImage) => void;
  /** Add a file to the catalogue. Resolves once the new entry is selected. */
  onUpload: (file: File) => Promise<void>;
  onRename: (image: ProductImage, label: string) => Promise<void>;
  onReplace: (image: ProductImage, file: File) => Promise<void>;
  onRemove: (image: ProductImage) => Promise<void>;
  onClose: () => void;
}

/**
 * **The catalogue, as a picture of itself: a grid of every entry beside a
 * column about one of them.**
 *
 * The whole component is presentational — every action is a callback that
 * resolves or rejects, and nothing here knows there is a network. That is what
 * lets the style guide render it against fixtures, and it is also the check
 * that the dialog's logic (which mutation, which invalidation, which entry the
 * form ends up pointing at) lives in the data shell where it can be read in one
 * place.
 *
 * **Clicking a tile fills the column; a separate button commits the pick.** A
 * click that both selected *and* committed would make browsing impossible —
 * looking at the picture 22 products share would change this product's picture
 * on the way past — and the column is where the entry's name, its reach and its
 * two destructive verbs live, so there has to be a state where an entry is
 * being looked at rather than chosen.
 *
 * **Both reads are category-2 calls**: small, indexed, bounded, landing in a
 * frame or two. So the grid renders *nothing* until the rows arrive rather than
 * a skeleton that would flash — inside a container that already has its final
 * size, which is the part that actually keeps the layout still. Each tile keeps
 * a fixed frame for the same reason, and the usage badge sits in a reserved
 * slot so the counts landing after the pictures moves nothing.
 */
export function ImageCatalogueView({
  images,
  usage,
  selectedId,
  onSelectTile,
  onUse,
  onUpload,
  onRename,
  onReplace,
  onRemove,
  onClose,
}: ImageCatalogueViewProps) {
  const t = useTranslations("admin.products.imageCatalogue");
  const tError = useTranslations("admin.products.imageCatalogue.errors");
  const c = useTranslations("common");

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ImageCatalogueAction | null>(
    null,
  );
  const uploadInput = useRef<HTMLInputElement>(null);

  const selected = images?.find((image) => image.id === selectedId) ?? null;
  const selectedUsers = selected ? (usage?.[selected.id] ?? []) : [];

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      await onUpload(file);
    } catch (err) {
      setError(productImageErrorMessage(err, tError));
    } finally {
      // Cleared either way: nothing unmounts on a successful upload — the admin
      // stays in the dialog with the new entry in the column — so the button
      // has to come back for the next one.
      setUploading(false);
    }
  }

  return (
    <DialogContent className="flex h-[min(85vh,880px)] flex-col p-0">
      <DialogHeader className="flex-row items-start justify-between gap-4 space-y-0 border-b border-border p-6 pb-4">
        <div className="space-y-1.5">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </div>
        <div className="shrink-0">
          <input
            ref={uploadInput}
            type="file"
            accept={PRODUCT_IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared before the request so choosing the same file twice
              // (after a refusal) fires a change event the second time too.
              e.target.value = "";
              if (file) void handleUpload(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={uploading}
            onClick={() => uploadInput.current?.click()}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading ? t("uploading") : t("upload")}
          </Button>
        </div>
      </DialogHeader>

      {error && (
        <p className="mx-6 mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-6 pt-4 sm:flex-row">
        {/* Two thirds grid. The container has its final size before the rows
            land, so the arriving pictures fill it rather than growing it. */}
        {/* The padding is the scroll region's own breathing room: the site's
            scrollbar is a solid 8px track, and a container that clips flush
            against it would cut a tile's border and focus ring off at the
            edge. The stable gutter keeps the tiles the same width whether or
            not the grid currently scrolls. */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1 pr-3 [scrollbar-gutter:stable] sm:basis-2/3">
          {images !== undefined && images.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("emptyCatalogue")}
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(images ?? []).map((image) => {
                const count = usage?.[image.id]?.length ?? 0;
                const isSelected = image.id === selectedId;
                return (
                  <li key={image.id}>
                    <button
                      type="button"
                      onClick={() => onSelectTile(image.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "w-full rounded-md border p-2 text-left transition-colors hover:bg-accent",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border",
                      )}
                    >
                      <ProductBanner
                        src={productImageSrc(image.path)}
                        sizes="200px"
                        className="rounded"
                      />
                      <span className="mt-2 block truncate text-xs font-medium">
                        {image.label}
                      </span>
                      {/* Reserved slot. The usage read lands after the
                          catalogue read, and a badge appearing in a line that
                          did not exist a moment ago would nudge every tile
                          below it down. */}
                      <span className="mt-1 flex h-5 items-center">
                        {count > 0 && (
                          <Badge variant="secondary">
                            {t("usedBadge", { count })}
                          </Badge>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* One third reference column, always present so the grid never
            reflows between "nothing selected" and "something selected". */}
        <div className="min-h-0 shrink-0 overflow-y-auto border-border py-1 pr-3 [scrollbar-gutter:stable] sm:basis-1/3 sm:border-l sm:pl-4">
          {selected === null ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("columnEmpty")}
            </p>
          ) : (
            <SelectedImagePanel
              key={selected.id}
              image={selected}
              users={selectedUsers}
              onUse={() => onUse(selected)}
              onRename={(label) => onRename(selected, label)}
              onReplace={() => setConfirming("replace")}
              onRemove={() => setConfirming("remove")}
            />
          )}
        </div>
      </div>

      <div className="flex justify-end border-t border-border p-6 py-4">
        <Button type="button" variant="outline" onClick={onClose}>
          {c("close")}
        </Button>
      </div>

      {selected !== null && confirming !== null && (
        <ImageActionConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirming(null)}
          action={confirming}
          label={selected.label}
          products={selectedUsers}
          onConfirm={async (file) => {
            if (confirming === "replace") {
              if (file === null) return;
              await onReplace(selected, file);
            } else {
              await onRemove(selected);
            }
            setConfirming(null);
          }}
        />
      )}
    </DialogContent>
  );
}

/**
 * The reference column's filled state: what this picture is, who it reaches,
 * and the three things an admin can do with it.
 *
 * Keyed by entry id at the call site, so selecting a different tile starts a
 * fresh panel rather than carrying a half-typed rename across to another
 * picture.
 */
function SelectedImagePanel({
  image,
  users,
  onUse,
  onRename,
  onReplace,
  onRemove,
}: {
  image: ProductImage;
  users: readonly ProductImageUser[];
  onUse: () => void;
  onRename: (label: string) => Promise<void>;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("admin.products.imageCatalogue");
  const tError = useTranslations("admin.products.imageCatalogue.errors");
  const c = useTranslations("common");

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(image.label);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [used, setUsed] = useState(false);

  async function saveName() {
    const parsed = productImageLabel.safeParse(draft);
    if (!parsed.success) {
      setRenameError(tError("nameRequired"));
      return;
    }
    setCommitting(true);
    setRenameError(null);
    try {
      await onRename(parsed.data);
      setRenaming(false);
    } catch (err) {
      setRenameError(productImageErrorMessage(err, tError));
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <ProductBanner
        src={productImageSrc(image.path)}
        sizes="320px"
        className="rounded-md border border-border"
      />

      <Button
        type="button"
        className="w-full"
        disabled={used}
        onClick={() => {
          // The dialog closes on this click, so the flag only has to survive
          // the render between the click and the unmount — but it does have to
          // survive that one, or a double click commits twice.
          setUsed(true);
          onUse();
        }}
      >
        {t("use")}
      </Button>

      <div>
        {renaming ? (
          <div className="space-y-2">
            <Input
              value={draft}
              autoFocus
              aria-label={t("nameLabel")}
              maxLength={PRODUCT_IMAGE_LABEL_MAX_LENGTH}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={committing}
                onClick={saveName}
              >
                {committing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                {c("save")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={committing}
                onClick={() => {
                  setRenaming(false);
                  setDraft(image.label);
                  setRenameError(null);
                }}
              >
                <X className="h-4 w-4" />
                {c("cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-sm font-medium">
              {image.label}
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => setRenaming(true)}
            >
              <Pencil className="h-4 w-4" />
              {t("rename")}
            </Button>
          </div>
        )}
        {renameError && (
          <p className="mt-2 text-xs text-destructive">{renameError}</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("usedBy")}
        </p>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("usedByNone")}</p>
        ) : (
          <ProductImageUserList products={users} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onReplace}>
          {t("replace")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={onRemove}
        >
          {t("remove")}
        </Button>
      </div>
    </div>
  );
}
