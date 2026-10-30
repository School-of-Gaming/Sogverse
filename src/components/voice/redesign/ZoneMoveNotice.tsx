"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "../VoiceRoomProvider";
import type { RoomStage } from "./use-room-stage";

/**
 * Says what a zone move just changed: where the reader is now and who they can
 * hear. It floats over the top of the stage, taking no space, so it shifts
 * nothing and covers the stage only until it goes. The way back is offered only
 * for a move the reader made and can undo, because a moderator's placement is
 * not theirs to reverse.
 *
 * The live region stays mounted with nothing in it, which is what makes a screen
 * reader announce the words when they arrive.
 */
export function ZoneMoveNoticeHost({ stage }: { stage: RoomStage }) {
  const t = useTranslations("voice.stage");
  const c = useTranslations("common");
  const { zones } = useVoiceRoom();
  const { notice } = stage;

  const zone = zones.find((z) => z.id === notice?.zoneId);
  const fromZone = zones.find((z) => z.id === notice?.fromZoneId);
  const canGoBack =
    notice !== null && notice.byReader && fromZone !== undefined && stage.canEnter(fromZone);
  const zoneName = stage.currentZoneName;

  return (
    <div
      role="status"
      className="pointer-events-none absolute inset-x-2 top-2 z-20 flex justify-center"
    >
      {notice !== null && zone !== undefined && (
        <div className="glass pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border border-border py-1.5 pl-3 pr-1.5 shadow-lg">
          <p className="min-w-0 text-sm">
            {notice.byReader
              ? t("moved", { zone: zoneName })
              : t("movedByModerator", { zone: zoneName })}{" "}
            {t("hearNow", { count: stage.hearCount })}
          </p>
          {canGoBack && (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => stage.enterZone(fromZone.id)}
            >
              {t("goBack")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={stage.dismissNotice}
            aria-label={c("close")}
            title={c("close")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
