"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateSiteNotes } from "@/services/products";

/**
 * The one affordance on this page that writes the site's street address.
 *
 * **It is a control of its own inside the site-notes section because the two
 * fields have different owners, and that split is the point.** The two site
 * *notes* are written by whoever runs the building's sessions — an admin or an
 * assigned gedu — through an RPC that deliberately takes no address at all. The
 * address is family-facing site detail belonging to the location record, an
 * admin's alone, and it travels on the admin route instead. One control per
 * owner is what stops a note save carrying a stale address back with it, which
 * is the bug the RPC dropped its address parameter to kill.
 *
 * **It sends the address and nothing else**, and the route leaves an absent
 * field alone rather than writing it null — so this cannot blank a note
 * somebody wrote a moment ago in the panel around it.
 *
 * **It renders no address of its own.** The shared notes panel already shows
 * it, read-only, exactly as a gedu sees it; a second copy here would be the
 * same fact in two places, free to disagree for a frame after a save. So this
 * is a control and an editor, nothing more — and it reaches the panel through
 * that panel's `addressEditor` slot rather than living inside it, because a
 * panel that grew an edit button for some viewers would mean two different
 * things depending on who opened it.
 */
export function SiteAddressField({
  locationId,
  address,
}: {
  locationId: string;
  /** What is stored, seeded into the draft. `null` when nobody has filled one in. */
  address: string | null;
}) {
  const t = useTranslations("admin.products.sessions");
  const c = useTranslations("common");
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
      // Resolves only once the product document carrying this address has been
      // refetched — the mutation owns that invalidation — so the editor closes
      // over the value it just wrote rather than the one it replaced.
      await update.mutateAsync({
        location_id: locationId,
        member: { address: draft },
      });
      setEditing(false);
    } catch {
      // The thrown message is English server text written for a log, exactly
      // as the notes panel around this one treats its own refusals: one
      // translated line, and the draft left where it is for the retry.
      setError(t("addressSaveFailed"));
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
