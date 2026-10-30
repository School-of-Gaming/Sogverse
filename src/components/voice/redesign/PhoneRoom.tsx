"use client";

import { useState } from "react";
import { ChevronDown, MessageSquare, MoreHorizontal, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ParticipantList } from "../ParticipantList";
import { PhoneZonesSheet } from "./PhoneZonesSheet";
import { useHearStatus } from "./room-status";
import {
  CameraControl,
  LabelledButton,
  LeaveControl,
  MicControl,
  MicSettings,
  ModeratorControls,
  useHasModeratorControls,
} from "./RoomControls";
import { TileStage } from "./TileStage";
import type { VoiceRoomRedesignProps } from "./types";
import type { RoomStage } from "./use-room-stage";
import { ZoneGlyph } from "./ZoneEntry";
import { ZoneMoveNoticeHost } from "./ZoneMoveNotice";

/** Taller than wide at the most, so the 360px floor's two columns fill a tall stage. */
const TILE_ASPECT = { min: 2 / 3, max: 4 / 3 };
const MIN_TILE_WIDTH = 150;
/** The whole chat surface's height inside its sheet: one height, granted here. */
const CHAT_HEIGHT = "h-[65dvh]";

type OpenSheet = "zones" | "chat" | "people" | "more" | null;

/**
 * The room in a hand: the stage fills the screen between a strip saying where
 * you are and a bar of big labelled targets, and everything else is a sheet.
 *
 * **The sheets stay mounted while closed**, which is the sheet's own design and
 * what keeps a half-written message and the chat's subscription alive between
 * looks. The mic's device chevron stays on the mic cell rather than moving into
 * More, because its error badge is how a reader whose mic has failed finds out.
 */
export function PhoneRoom({
  stage,
  title,
  titleAccessory,
  chat,
  participantChatControls,
  leaveLabel,
}: VoiceRoomRedesignProps & { stage: RoomStage }) {
  const t = useTranslations("voice");
  const hearStatus = useHearStatus(stage);
  const hasMore = useHasModeratorControls();
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const closeTo = (next: boolean) => {
    if (!next) setSheet(null);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <Heading level={1} step="card-title" srOnly>
        {title ?? t("voiceRoom")}
      </Heading>

      <header className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <button
          type="button"
          onClick={() => setSheet("zones")}
          aria-haspopup="dialog"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
        >
          {stage.currentZone && <ZoneGlyph zone={stage.currentZone} />}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">
              {t("stage.youAreIn", { zone: stage.currentZoneName })}
            </span>
            <span className="truncate text-xs text-muted-foreground">{hearStatus}</span>
          </span>
          <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium">
            {t("stage.zones")}
            <ChevronDown className="h-4 w-4" aria-hidden />
          </span>
        </button>
        {titleAccessory}
      </header>

      <main className="relative min-h-0 flex-1 p-2">
        <ZoneMoveNoticeHost stage={stage} />
        <TileStage
          members={stage.stageMembers}
          sharer={stage.sharer}
          shareLayout="below"
          tileAspect={TILE_ASPECT}
          minTileWidth={MIN_TILE_WIDTH}
        />
      </main>

      <nav
        aria-label={t("stage.controls")}
        className="flex shrink-0 gap-1 border-t border-border p-1"
      >
        <div className="relative min-w-0 flex-1">
          <MicControl />
          <div className="absolute -right-0.5 -top-0.5">
            <MicSettings />
          </div>
        </div>
        <CameraControl cellClassName="min-w-0 flex-1" />
        {chat !== undefined && (
          <LabelledButton
            icon={<MessageSquare />}
            label={t("stage.chat")}
            variant="outline"
            aria-haspopup="dialog"
            onClick={() => setSheet("chat")}
            cellClassName="min-w-0 flex-1"
          />
        )}
        <LabelledButton
          icon={<Users />}
          label={t("stage.people")}
          variant="outline"
          aria-haspopup="dialog"
          onClick={() => setSheet("people")}
          cellClassName="min-w-0 flex-1"
        />
        {hasMore && (
          <LabelledButton
            icon={<MoreHorizontal />}
            label={t("stage.more")}
            variant="outline"
            aria-haspopup="dialog"
            onClick={() => setSheet("more")}
            cellClassName="min-w-0 flex-1"
          />
        )}
        <LeaveControl
          leaving={stage.leaving}
          onLeave={() => void stage.leave()}
          label={leaveLabel}
          cellClassName="min-w-0 flex-1"
        />
      </nav>

      <PhoneZonesSheet
        open={sheet === "zones"}
        onOpenChange={closeTo}
        stage={stage}
      />

      {chat !== undefined && (
        <Sheet open={sheet === "chat"} onOpenChange={closeTo} side="bottom">
          <SheetContent>
            <SheetHeader onClose={() => setSheet(null)}>
              <SheetTitle>{t("stage.chat")}</SheetTitle>
            </SheetHeader>
            {/* The bottom padding is the line the typing indicator draws into. */}
            <div className="px-2 pb-6 pt-2">{chat(CHAT_HEIGHT)}</div>
          </SheetContent>
        </Sheet>
      )}

      <Sheet open={sheet === "people"} onOpenChange={closeTo} side="bottom">
        <SheetContent>
          <SheetHeader onClose={() => setSheet(null)}>
            <SheetTitle>{t("stage.people")}</SheetTitle>
          </SheetHeader>
          <SheetBody className="max-h-[70dvh] px-3">
            <ParticipantList participantChatControls={participantChatControls} />
          </SheetBody>
        </SheetContent>
      </Sheet>

      {hasMore && (
        <Sheet open={sheet === "more"} onOpenChange={closeTo} side="bottom">
          <SheetContent>
            <SheetHeader onClose={() => setSheet(null)}>
              <SheetTitle>{t("stage.more")}</SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 p-4">
              <ModeratorControls />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
