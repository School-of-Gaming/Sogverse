"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { ZoneIconPicker } from "./ZoneIconPicker";
import { ZoneColorPicker } from "./ZoneColorPicker";
import type { VoiceZone, VoiceZoneIcon, VoiceZoneColor } from "@/types";

const MAX_NAME = 40;

interface ZoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit that zone; absent → create a new one. */
  zone?: VoiceZone;
}

/**
 * Create or edit a custom voice zone (moderator-only). Name + icon + color, plus
 * a "private zone" toggle on create (an existing zone's locked status isn't
 * editable — flipping it would orphan placements). Uses the committing pattern:
 * the submit button stays disabled through to the close on success.
 */
export function ZoneDialog({ open, onOpenChange, zone }: ZoneDialogProps) {
  const t = useTranslations("voice");
  const c = useTranslations("common");
  const { createZone, updateZone } = useVoiceRoom();
  const isEdit = !!zone;

  const [name, setName] = useState(zone?.name ?? "");
  const [icon, setIcon] = useState<VoiceZoneIcon>(zone?.icon ?? "star");
  const [color, setColor] = useState<VoiceZoneColor>(zone?.color ?? "sky");
  const [isLocked, setIsLocked] = useState(zone?.is_locked ?? false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSubmit = trimmed.length >= 1 && trimmed.length <= MAX_NAME && !committing;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setCommitting(true);
    setError(null);
    try {
      if (isEdit) {
        await updateZone(zone.id, { name: trimmed, icon, color });
      } else {
        await createZone({ name: trimmed, icon, color, isLocked });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : c("unexpectedError"));
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editZone") : t("newZone")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="zone-name">{t("zoneName")}</Label>
            <Input
              id="zone-name"
              value={name}
              maxLength={MAX_NAME}
              placeholder={t("zoneNamePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("chooseIcon")}</Label>
            <ZoneIconPicker value={icon} onChange={setIcon} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("chooseColor")}</Label>
            <ZoneColorPicker value={color} onChange={setColor} />
          </div>

          {!isEdit && (
            <button
              type="button"
              onClick={() => setIsLocked((v) => !v)}
              aria-pressed={isLocked}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                isLocked ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
              )}
            >
              <Lock className={cn("mt-0.5 h-4 w-4 shrink-0", isLocked ? "text-primary" : "text-muted-foreground")} />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{t("makePrivate")}</span>
                <span className="block text-xs text-muted-foreground">{t("makePrivateHint")}</span>
              </span>
            </button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing}>
            {c("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEdit ? t("saveZone") : t("createZone")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
