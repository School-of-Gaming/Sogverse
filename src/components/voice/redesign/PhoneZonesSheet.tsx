"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import type { VoiceParticipant } from "../hooks/types";
import { VoiceAvatar } from "../VoiceAvatar";
import { useVoiceRoom } from "../VoiceRoomProvider";
import { useParticipantGlow } from "./use-participant-glow";
import type { RoomStage } from "./use-room-stage";
import { useZoneManagement } from "./use-zone-management";
import { ZoneEntry } from "./ZoneEntry";

/** Small enough that a zone's reserved strip shows two rows of them. */
const SHEET_AVATAR = "h-7 w-7 border border-border";

/** The sheet stays mounted while closed, so `open` rests the glow's analyser loop. */
function SheetAvatar({
  participant: p,
  open,
}: {
  participant: VoiceParticipant;
  open: boolean;
}) {
  const { glowRef, steadyGlow } = useParticipantGlow(p, open);
  return (
    <div
      style={steadyGlow}
      className={cn("shrink-0 rounded-md", p.isSpeaking && "relative z-10")}
    >
      <VoiceAvatar
        ref={glowRef}
        userId={p.userId}
        isLocal={p.isLocal}
        className={SHEET_AVATAR}
      />
    </div>
  );
}

/**
 * The zones on a phone. Tap a zone to move in.
 *
 * **A moderator moves somebody else by tapping their picture, then a zone**,
 * because dragging inside a scrolling sheet fights the scroll. The sheet stays
 * where it is and asks where they should go, the same zones becoming the
 * answer, so there is no second list to build or a menu row to add to the live
 * participant row.
 */
export function PhoneZonesSheet({
  open,
  onOpenChange,
  stage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: RoomStage;
}) {
  const t = useTranslations("voice.stage");
  const { zones, participantsByZone, currentZoneId, moveParticipantToZone, isModerator } =
    useVoiceRoom();
  const { manageFor, newZone, dialogs } = useZoneManagement();
  const [moving, setMoving] = useState<VoiceParticipant | null>(null);

  const close = (next: boolean) => {
    if (!next) setMoving(null);
    onOpenChange(next);
  };

  return (
    <Sheet open={open} onOpenChange={close} side="bottom">
      <SheetContent>
        <SheetHeader onClose={() => close(false)}>
          <SheetTitle>
            {moving === null ? t("zones") : t("moveTitle", { name: moving.userName })}
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="max-h-[70dvh] space-y-2 px-4">
          <p className="text-xs text-muted-foreground">
            {moving !== null
              ? t("moveHint")
              : isModerator
                ? t("zonesHintModerator")
                : t("zonesHint")}
          </p>
          {zones.map((zone) => {
            const members = participantsByZone.get(zone.id) ?? [];
            const onEnter =
              moving !== null
                ? () => {
                    moveParticipantToZone(moving.sessionId, moving.userId, zone.id);
                    setMoving(null);
                  }
                : stage.canEnter(zone)
                  ? () => {
                      stage.enterZone(zone.id);
                      close(false);
                    }
                  : undefined;
            return (
              <ZoneEntry
                key={zone.id}
                zone={zone}
                label={stage.zoneLabel(zone)}
                occupied={members.length > 0}
                isCurrent={zone.id === currentZoneId}
                onEnter={onEnter}
                manage={moving === null ? manageFor(zone) : undefined}
              >
                {members.map((p) =>
                  isModerator && !p.isLocal ? (
                    <button
                      key={p.sessionId}
                      type="button"
                      aria-label={t("moveTitle", { name: p.userName })}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMoving(p);
                      }}
                    >
                      <SheetAvatar participant={p} open={open} />
                    </button>
                  ) : (
                    <SheetAvatar key={p.sessionId} participant={p} open={open} />
                  ),
                )}
              </ZoneEntry>
            );
          })}
          {moving === null ? (
            newZone
          ) : (
            <Button variant="outline" className="w-full" onClick={() => setMoving(null)}>
              {t("cancelMove")}
            </Button>
          )}
          {dialogs}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
