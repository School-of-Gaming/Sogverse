"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateSiteNotesV2 } from "@/services/products-v2";

// One panel that renders the read state + edit affordance for either tier
// of site notes (member-visible or staff-only). Member tier has an address
// field; staff tier is notes-only.

interface SiteNotesEditorProps {
  locationId: string;
  tier: "member" | "staff";
  /** Current member-visible address (member tier only). */
  address?: string | null;
  /** Current notes for this tier. */
  notes?: string | null;
}

export function SiteNotesEditor({
  locationId,
  tier,
  address,
  notes,
}: SiteNotesEditorProps) {
  const t = useTranslations("admin.productsV2.locationPicker");
  const c = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [draftAddress, setDraftAddress] = useState(address ?? "");
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateSiteNotesV2();

  const isMember = tier === "member";
  const labelKey = isMember ? "memberNotesLabel" : "staffNotesLabel";
  const hintKey = isMember ? "memberNotesHint" : "staffNotesHint";
  const emptyKey = isMember ? "noMemberNotes" : "noStaffNotes";

  function startEdit() {
    setDraftAddress(address ?? "");
    setDraftNotes(notes ?? "");
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setError(null);
    setEditing(false);
  }

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({
        location_id: locationId,
        ...(isMember
          ? { member: { address: draftAddress, notes: draftNotes } }
          : { staff: { notes: draftNotes } }),
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : c("unexpectedError"));
    }
  }

  if (editing) {
    return (
      <div className="rounded-md border border-input bg-background p-3 text-sm">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t(labelKey)}
        </div>
        <div className="mt-2 space-y-2">
          {isMember && (
            <div className="space-y-1">
              <Label htmlFor={`addr-${locationId}`} className="text-xs">
                {t("addressLabel")}
              </Label>
              <Input
                id={`addr-${locationId}`}
                value={draftAddress}
                onChange={(e) => setDraftAddress(e.target.value)}
                placeholder={t("addressPlaceholder")}
                disabled={update.isPending}
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor={`notes-${locationId}-${tier}`} className="text-xs">
              {t(`${tier}NotesFieldLabel`)}
            </Label>
            <textarea
              id={`notes-${locationId}-${tier}`}
              rows={3}
              value={draftNotes}
              onChange={(e) => setDraftNotes(e.target.value)}
              placeholder={t(`${tier}NotesPlaceholder`)}
              disabled={update.isPending}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelEdit}
              disabled={update.isPending}
            >
              {c("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={save}
              disabled={update.isPending}
            >
              {update.isPending && (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              )}
              {c("save")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasContent = isMember
    ? Boolean(address) || Boolean(notes)
    : Boolean(notes);

  return (
    <div className="rounded-md border border-input bg-background p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t(labelKey)}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={startEdit}
          className="h-6 -my-1 -mr-1 gap-1 px-2 text-xs"
        >
          <Pencil className="h-3 w-3" />
          {t("edit")}
        </Button>
      </div>
      {isMember && address ? (
        <div className="mt-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t("addressLabel")}:
          </span>{" "}
          <span>{address}</span>
        </div>
      ) : null}
      {notes ? (
        <p className="mt-1 whitespace-pre-wrap">{notes}</p>
      ) : null}
      {!hasContent && (
        <p className="mt-1 text-muted-foreground">{t(emptyKey)}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t(hintKey)}</p>
    </div>
  );
}
