"use client";

import { useTranslations } from "next-intl";
import type { Locked } from "@/components/ui/locked-control";
import type { Withheld } from "@/lib/withheld";
import {
  TwoAudienceNotesPanel,
  type TwoAudienceNotesDraft,
} from "./TwoAudienceNotesPanel";

/** The two standing notes a group carries, independent of any session. */
export type GroupNotesDraft = TwoAudienceNotesDraft;

interface GroupNotesPanelProps {
  publicNote: string | null;
  /** The staff half — text, `null` for none, or withheld from this reader. */
  staffNote: string | null | Withheld;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  /** Persist both notes, or the lock a shell shows in the Save's place. */
  onSave: ((draft: GroupNotesDraft) => void | Promise<void>) | Locked;
}

/**
 * The **group's** standing notes — the "About this group" row directly under
 * the page's masthead, above the point where the workspace splits into columns.
 *
 * This is the group-scoped instance of the shared two-audience notes panel: how
 * the shared world works, who the siblings are, which laptop has bad audio.
 * Everything about how it behaves lives in that panel; all this adds is which
 * scope it describes and the copy that says so.
 */
export function GroupNotesPanel({
  publicNote,
  staffNote,
  editing,
  onEditingChange,
  onSave,
}: GroupNotesPanelProps) {
  const t = useTranslations("gedu.groupNotes");
  const g = useTranslations("gedu.groupWorkspace");

  return (
    <TwoAudienceNotesPanel
      copy={{
        heading: t("heading"),
        edit: t("edit"),
        cancel: t("cancel"),
        save: t("save"),
        publicEmpty: t("publicEmpty"),
        staffEmpty: t("staffEmpty"),
        publicLabel: t("publicLabel"),
        publicHint: t("publicHint"),
        publicPlaceholder: t("publicPlaceholder"),
        staffLabel: t("staffLabel"),
        staffHint: t("staffHint"),
        staffPlaceholder: t("staffPlaceholder"),
        staffWithheld: g("staffNoteWithheld"),
        saveFailed: t("saveFailed"),
      }}
      publicNote={publicNote}
      staffNote={staffNote}
      editing={editing}
      onEditingChange={onEditingChange}
      onSave={onSave}
    />
  );
}
