"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
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
import { asZoneIcon, asZoneColor, pickRandomZoneAppearance, VOICE_ZONE_COLORS } from "@/lib/constants/voice-zones";
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
  // On create, start on a random icon + color so each new zone looks fresh and
  // a little surprising (zones may share an appearance; the moderator can change
  // either). Lazy initializers → rolled once on open, mount-only.
  const [icon, setIcon] = useState<VoiceZoneIcon>(
    () => (zone ? asZoneIcon(zone.icon) : pickRandomZoneAppearance().icon),
  );
  const [color, setColor] = useState<VoiceZoneColor>(
    () => (zone ? asZoneColor(zone.color) : pickRandomZoneAppearance().color),
  );
  const [isLocked, setIsLocked] = useState(zone?.is_locked ?? false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dialog frame previews the selected color the same way an active zone
  // card does: high-contrast border + the color's inset glow spilling in from
  // the edge. Updates live as the moderator changes the color.
  const colorClasses = VOICE_ZONE_COLORS[color];

  const trimmed = name.trim();
  // The name is optional — a blank zone is identified by its icon + color. Only
  // the upper bound is enforced; an empty field is stored as null.
  const nameValue = trimmed.length > 0 ? trimmed : null;
  const canSubmit = trimmed.length <= MAX_NAME && !committing;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setCommitting(true);
    setError(null);
    try {
      if (isEdit) {
        await updateZone(zone.id, { name: nameValue, icon, color });
      } else {
        await createZone({ name: nameValue, icon, color, isLocked });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : c("unexpectedError"));
      setCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={colorClasses.glow}>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editZone") : t("newZone")}</DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <Field label={t("zoneName")} htmlFor="zone-name" optional>
            <Input
              id="zone-name"
              value={name}
              maxLength={MAX_NAME}
              placeholder={t("zoneNamePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label={t("chooseIcon")}>
            <ZoneIconPicker value={icon} color={VOICE_ZONE_COLORS[color]} onChange={setIcon} />
          </Field>

          <Field label={t("chooseColor")}>
            <ZoneColorPicker value={color} onChange={setColor} />
          </Field>

          {!isEdit && (
            <button
              type="button"
              onClick={() => setIsLocked((v) => !v)}
              role="switch"
              aria-checked={isLocked}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors",
                isLocked ? "bg-primary/5" : "hover:bg-accent",
              )}
            >
              <Lock className={cn("h-4 w-4 shrink-0", isLocked ? "text-primary" : "text-muted-foreground")} />
              <span className="flex-1 space-y-0.5">
                <span className="block text-sm font-medium">{t("makePrivate")}</span>
                <span className="block text-xs text-muted-foreground">{t("makePrivateHint")}</span>
              </span>
              {/* Visible switch so the row reads as a toggle, not a static row.
                  Decorative (the whole button is the control) → aria-hidden. */}
              <span
                aria-hidden
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  isLocked ? "bg-primary" : "bg-muted-foreground/30",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 left-0.5 h-4 w-4 rounded-full border border-border bg-background shadow-sm transition-transform",
                    isLocked && "translate-x-4",
                  )}
                />
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
