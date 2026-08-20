"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import {
  useDeleteProductImage,
  useProductImageUsage,
  useProductImages,
  useRenameProductImage,
  useReplaceProductImage,
  useUploadProductImage,
} from "@/services/product-images";
import type { ProductImage } from "@/types";
import { ImageCatalogueView } from "./image-catalogue-view";
import type { ProductImageEntry } from "./product-image-selection";

interface ImageCatalogueDialogProps {
  /**
   * The entry the product currently points at. Not the same thing as the
   * entry filling the column — this one decides whether a change made in here
   * is also a change to the product being edited.
   */
  productImageId: string | null;
  /** The admin committed a pick. The dialog closes on the same click. */
  onSelect: (entry: ProductImageEntry) => void;
  /**
   * The entry the product points at changed underneath it — renamed, or
   * replaced by a new one — or was removed from the catalogue entirely
   * (`null`). The card follows without re-reading anything.
   */
  onEntryChanged: (entry: ProductImageEntry | null) => void;
  onClose: () => void;
}

/**
 * **The data shell: this is the only thing in the catalogue that knows there is
 * a server.** It mounts the two reads and the four mutations, decides what each
 * outcome means for the product being edited, and hands the presentational view
 * a set of promises. The split is what lets the view be rendered from fixtures
 * in the style guide, and it is also where the one rule worth stating out loud
 * lives: *whether a change here touches the product being edited is decided by
 * comparing ids, never by which entry happens to be selected in the column.*
 *
 * **It is rendered only while the dialog is open**, by a caller that mounts it
 * on the open state rather than passing `open` into it. That is not a style
 * choice: the two reads are hooks, so a component rendered with `open={false}`
 * would still issue both of them, and an admin who opens a product's edit page
 * and never touches the picture would pay for a catalogue read and a
 * products-usage read they never look at.
 *
 * Every mutation is awaited through `mutateAsync`, and each one's `onSuccess`
 * returns its invalidation — so by the time a handler here resolves, the list
 * the view is about to re-render from is already the fresh one.
 */
export function ImageCatalogueDialog({
  productImageId,
  onSelect,
  onEntryChanged,
  onClose,
}: ImageCatalogueDialogProps) {
  const { data: images } = useProductImages();
  const { data: usage } = useProductImageUsage();
  const upload = useUploadProductImage();
  const rename = useRenameProductImage();
  const replace = useReplaceProductImage();
  const remove = useDeleteProductImage();

  // The column opens on the product's own picture, because that is the entry
  // the admin is most likely to be here about — to see what else uses it
  // before changing it.
  const [selectedId, setSelectedId] = useState<string | null>(productImageId);

  return (
    <Dialog open size="wide" onOpenChange={(open) => !open && onClose()}>
      <ImageCatalogueView
        images={images}
        usage={usage}
        selectedId={selectedId}
        onSelectTile={setSelectedId}
        onUse={(image) => {
          onSelect(toEntry(image));
          onClose();
        }}
        onUpload={async (file) => {
          const { image } = await upload.mutateAsync({ file });
          // Selected either way. `existing` is the dedup answering, not a
          // failure, and the admin's intent — "I want this picture" — is the
          // same sentence in both cases.
          setSelectedId(image.id);
        }}
        onRename={async (image, label) => {
          const renamed = await rename.mutateAsync({ id: image.id, label });
          if (renamed.id === productImageId) onEntryChanged(toEntry(renamed));
        }}
        onReplace={async (image, file) => {
          const { image: next } = await replace.mutateAsync({
            id: image.id,
            file,
          });
          setSelectedId(next.id);
          // A replace repoints every product that used the old entry, this one
          // included — so the form has to follow to the *new* id, or the save
          // would write the old entry back over the repoint.
          if (image.id === productImageId) onEntryChanged(toEntry(next));
        }}
        onRemove={async (image) => {
          await remove.mutateAsync(image.id);
          setSelectedId(null);
          // The row is gone and the foreign key has already nulled every link
          // to it. Leaving the id in form state would make the next save fail
          // on a picture the admin has just deliberately retired.
          if (image.id === productImageId) onEntryChanged(null);
        }}
        onClose={onClose}
      />
    </Dialog>
  );
}

function toEntry(image: ProductImage): ProductImageEntry {
  return { id: image.id, label: image.label, path: image.path };
}
