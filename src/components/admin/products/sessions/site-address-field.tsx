"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminSessionKeys } from "@/services/admin-sessions";
import { useUpdateSiteNotes } from "@/services/products";

/**
 * The one affordance on this page that writes the venue's street address.
 *
 * **It is separate from the site-notes panel above it because the two fields
 * have different owners, and that split is the point.** The two site *notes*
 * are written by whoever runs the building's sessions — an admin or an assigned
 * gedu — through an RPC that deliberately takes no address at all. The address
 * is family-facing venue detail belonging to the location record, an admin's
 * alone, and it travels on the admin route instead. One control per owner is
 * what stops a note save carrying a stale address back with it, which is the
 * bug the RPC dropped its address parameter to kill.
 *
 * **It sends the address and nothing else**, and the route leaves an absent
 * field alone rather than writing it null — so this cannot blank a note
 * somebody wrote a moment ago in the panel directly above.
 *
 * **It renders no address of its own.** The shared notes panel already shows
 * it, read-only, exactly as a gedu sees it; a second copy here would be the
 * same fact in two places, free to disagree for a frame after a save. So this
 * is a control and an editor, nothing more — and it lives on the admin surface
 * rather than inside the shared panel, because a panel that grew an edit button
 * for some viewers would mean two different things depending on who opened it.
 */
export function SiteAddressField({
  productId,
  locationId,
  address,
}: {
  productId: string;
  locationId: string;
  /** What is stored, seeded into the draft. `null` when nobody has filled one in. */
  address: string | null;
}) {
  const t = useTranslations("admin.products.sessions");
  const c = useTranslations("common");
  const queryClient = useQueryClient();
  const update = useUpdateSiteNotes();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(address ?? "");
  const [error, setError] = useState<string | null>(null);
  /**
   * Flipped synchronously before the mutation runs, so the button cannot
   * re-enable in the gap between React Query dispatching its success state and
   * this component swapping back to its resting one.
   */
  const [committing, setCommitting] = useState(false);

  function startEdit() {
    setDraft(address ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    setError(null);
    setCommitting(true);
    try {
      await update.mutateAsync({
        location_id: locationId,
        member: { address: draft },
      });
      // The product document is what carries the address onto this page, so it
      // is what has to refetch — the reference cache the mutation invalidates
      // on its own is a different key that nothing here reads.
      await queryClient.invalidateQueries({
        queryKey: adminSessionKeys.byProduct(productId),
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : c("unexpectedError"));
    } finally {
      // Cleared on both outcomes: success swaps back to the resting control
      // rather than unmounting it, so a flag left set would strand the button.
      setCommitting(false);
    }
  }

  if (!editing) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={startEdit}
        className="mt-1.5 h-6 gap-1 px-2 text-xs"
      >
        <Pencil className="h-3 w-3" />
        {address === null ? t("addAddress") : t("editAddress")}
      </Button>
    );
  }

  return (
    <div className="mt-1.5 space-y-2">
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t("addressPlaceholder")}
        aria-label={t("addressLabel")}
        disabled={committing}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setEditing(false)}
          disabled={committing}
        >
          {c("cancel")}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={committing}
        >
          {committing && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {c("save")}
        </Button>
      </div>
    </div>
  );
}
