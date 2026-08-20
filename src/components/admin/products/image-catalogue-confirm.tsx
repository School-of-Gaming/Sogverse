"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRODUCT_IMAGE_ACCEPT } from "@/services/product-images";
import type { ProductImageUser } from "@/services/product-images";
import { productImageErrorMessage } from "./product-image-error";
import { ProductImageUserList } from "./image-catalogue-user-list";

export type ImageCatalogueAction = "replace" | "remove";

interface ImageActionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which verb is being confirmed. Decides the copy and whether a file is asked for. */
  action: ImageCatalogueAction;
  /** The entry's name, so the title says which picture is about to change. */
  label: string;
  /** Every product the entry reaches. Empty is the plain-confirm case. */
  products: readonly ProductImageUser[];
  /**
   * Do it. `file` is the replacement's bytes and is null for a removal.
   * Resolving means the caller has closed this dialog; rejecting leaves it
   * open with the reason shown, so the admin can retry or back out.
   */
  onConfirm: (file: File | null) => Promise<void>;
}

/**
 * **The confirm in front of the two verbs that reach other people's products.**
 *
 * A local component rather than the shared `ConfirmDialog` for two reasons that
 * are both structural: the shared one closes itself the moment its confirm is
 * clicked, so it cannot hold a button through a request it fired; and it has no
 * place to put a file input, which the replace half needs *inside* the confirm
 * so the list of affected products is read before the new picture is chosen.
 *
 * **The count is the safeguard.** Replacing or removing a picture 22 products
 * share is an ordinary thing to want and a catastrophic thing to do by
 * accident, so the dialog names the number twice — once in the consequence
 * sentence and once on the button under the cursor — and lists the products
 * themselves, each a link, in a scroll region between them. There is no
 * acknowledgement checkbox: a checkbox gates the list it is supposed to make
 * people read, and the number on the button is on screen at the moment of the
 * click, which the checkbox never is.
 *
 * The list scrolls and **the footer is pinned**, so the button carrying the
 * count is visible at N = 22 without scrolling to find it.
 *
 * It opens on top of the catalogue dialog on purpose — the catalogue stays
 * behind it, so cancelling puts the admin back where they were rather than at
 * the product form. `Dialog`'s depth register gives Escape to this one.
 */
export function ImageActionConfirmDialog({
  open,
  onOpenChange,
  action,
  label,
  products,
  onConfirm,
}: ImageActionConfirmDialogProps) {
  const t = useTranslations("admin.products.imageCatalogue");
  const tError = useTranslations("admin.products.imageCatalogue.errors");
  const c = useTranslations("common");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const count = products.length;
  const isReplace = action === "replace";

  async function handleConfirm() {
    // Nothing to commit. The button is already disabled without a file, so this
    // is unreachable through the UI — but the caller's replace path resolves
    // without acting on a null file, and a flag set for a request nobody made
    // would never be cleared: the dialog would sit behind a spinner with both
    // its buttons dead. Returning before the flag is set is what makes that
    // impossible rather than merely unlikely.
    if (isReplace && file === null) return;

    // Set before the request, not inside its resolution: the flag has to be
    // live on the very next render or a fast second click fires the action
    // twice. It is cleared only on the paths where the admin has to try again;
    // on success this dialog unmounts, which is what closes the gap.
    setCommitting(true);
    setError(null);
    try {
      await onConfirm(file);
    } catch (err) {
      setCommitting(false);
      setError(productImageErrorMessage(err, tError));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col p-0">
        <DialogHeader className="border-b border-border p-6 pb-4">
          <DialogTitle>
            {isReplace
              ? t("replaceConfirm.title", { label })
              : t("removeConfirm.title", { label })}
          </DialogTitle>
          <DialogDescription>
            {count === 0
              ? isReplace
                ? t("replaceConfirm.unused")
                : t("removeConfirm.unused")
              : isReplace
                ? t("replaceConfirm.consequence", { count })
                : t("removeConfirm.consequence", { count })}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-6 pt-4">
          {count > 0 && <ProductImageUserList products={products} />}

          {isReplace && (
            <div className="mt-4">
              <input
                ref={fileInput}
                type="file"
                accept={PRODUCT_IMAGE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setError(null);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={committing}
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="h-4 w-4" />
                {t("replaceConfirm.choose")}
              </Button>
              {/* No reserved slot: the filename is the only thing that can land
                  here, it lands because the admin just picked a file, and a
                  held-open line beside a button that has never been used is a
                  hole rather than a courtesy. */}
              {file && (
                <p className="mt-2 break-all text-xs text-muted-foreground">
                  {file.name}
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border p-6 pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={committing}
            onClick={() => onOpenChange(false)}
          >
            {c("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={committing || (isReplace && file === null)}
            onClick={handleConfirm}
          >
            {committing && <Loader2 className="h-4 w-4 animate-spin" />}
            {count === 0
              ? isReplace
                ? t("replaceConfirm.confirmUnused")
                : t("removeConfirm.confirmUnused")
              : isReplace
                ? t("replaceConfirm.confirm", { count })
                : t("removeConfirm.confirm", { count })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
