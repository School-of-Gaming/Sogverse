"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LockedButton } from "@/components/ui/locked-control";
import type { VoiceZoneView } from "@/lib/voice/zone-composition";
import type { VoiceZone } from "@/types";
import { useVoiceModeratorLocks } from "../VoiceModeratorLocks";
import { useVoiceRoom } from "../VoiceRoomProvider";
import { ZoneDialog } from "../ZoneDialog";
import type { ZoneManage } from "./ZoneEntry";

/**
 * The moderator's zone controls for whichever list shows zones: what each entry
 * offers, the New zone button and the dialogs behind them. A moderator gets them
 * working and a viewer the page handed locks gets them locked, in a group room
 * only, since an instant room has no custom zones for anyone.
 */
export function useZoneManagement(): {
  manageFor: (zone: VoiceZoneView) => ZoneManage | undefined;
  newZone: ReactNode;
  dialogs: ReactNode;
} {
  const t = useTranslations("voice");
  const { customZones, isModerator, groupId, deleteZone } = useVoiceRoom();
  const moderatorLocks = useVoiceModeratorLocks();
  const [dialog, setDialog] = useState<
    | { kind: "create" }
    | { kind: "edit"; zone: VoiceZone }
    | { kind: "delete"; zone: VoiceZone }
    | null
  >(null);

  const canManage = isModerator && groupId !== null;
  const zoneLock =
    !isModerator && groupId !== null && moderatorLocks !== null
      ? moderatorLocks.zones
      : null;

  const manageFor = (zone: VoiceZoneView): ZoneManage | undefined => {
    if (zone.kind !== "custom") return undefined;
    if (zoneLock !== null) return { locked: zoneLock };
    if (!canManage) return undefined;
    const open = (kind: "edit" | "delete") => {
      const row = customZones.find((z) => z.id === zone.id);
      if (row) setDialog({ kind, zone: row });
    };
    return { onEdit: () => open("edit"), onDelete: () => open("delete") };
  };

  const newZone = (
    <>
      {zoneLock !== null && (
        <LockedButton
          explanation={zoneLock}
          variant="outline"
          className="w-full border-dashed"
        >
          <Plus className="h-4 w-4" />
          {t("newZone")}
        </LockedButton>
      )}
      {canManage && (
        <Button
          variant="outline"
          className="w-full gap-1.5 border-dashed"
          onClick={() => setDialog({ kind: "create" })}
        >
          <Plus className="h-4 w-4" />
          {t("newZone")}
        </Button>
      )}
    </>
  );

  const dialogs = (
    <>
      {(dialog?.kind === "create" || dialog?.kind === "edit") && (
        <ZoneDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          zone={dialog.kind === "edit" ? dialog.zone : undefined}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={t("deleteZoneTitle")}
          description={t("deleteZoneDescription")}
          confirmLabel={t("deleteZoneConfirm")}
          onConfirm={() => void deleteZone(dialog.zone.id)}
        />
      )}
    </>
  );

  return { manageFor, newZone, dialogs };
}
