"use client";

import { useState } from "react";
import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import { cn } from "@/lib/cn";
import { ParticipantList } from "../ParticipantList";
import { DesktopZoneRail } from "./DesktopZoneRail";
import { useHearStatus } from "./room-status";
import {
  CameraControl,
  LeaveControl,
  MicControl,
  MicSettings,
  ModeratorControls,
} from "./RoomControls";
import { TileStage } from "./TileStage";
import type { VoiceRoomRedesignProps } from "./types";
import type { RoomStage } from "./use-room-stage";
import { ZoneMoveNoticeHost } from "./ZoneMoveNotice";

const TILE_ASPECT = 16 / 9;
const MIN_TILE_WIDTH = 200;
const CELL = "min-w-[4.75rem]";
/** Fills the panel's box, which is what the room grants the chat here. */
const CHAT_HEIGHT = "h-full";

/**
 * The room on a wide screen: nothing scrolls but the panels, and there are no
 * site links, because a child clicking Shop would drop out of the call. The
 * zone you are in is the stage, between the zones on the left and the chat and
 * people on the right, over the controls.
 */
export function DesktopRoom({
  stage,
  title,
  titleAccessory,
  chat,
  participantChatControls,
  leaveLabel,
}: VoiceRoomRedesignProps & { stage: RoomStage }) {
  const t = useTranslations("voice");
  const hearStatus = useHearStatus(stage);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Mic className="h-4 w-4 shrink-0" aria-hidden />
          <Heading level={1} step="card-title">
            {title ?? t("voiceRoom")}
          </Heading>
        </div>
        {titleAccessory}
        <p className="ml-auto truncate text-sm text-muted-foreground">
          {t("stage.statusLine", { zone: stage.currentZoneName, status: hearStatus })}
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <DesktopZoneRail stage={stage} />
        <main className="relative min-w-0 flex-1 p-2">
          <ZoneMoveNoticeHost stage={stage} />
          <TileStage
            members={stage.stageMembers}
            sharer={stage.sharer}
            shareLayout="strip"
            tileAspect={TILE_ASPECT}
            minTileWidth={MIN_TILE_WIDTH}
          />
        </main>
        <SidePanel chat={chat} participantChatControls={participantChatControls} />
      </div>

      <footer className="flex shrink-0 items-center justify-center gap-2 border-t border-border p-2">
        <div className="flex items-center gap-1">
          <MicControl cellClassName={CELL} />
          <MicSettings />
        </div>
        <CameraControl cellClassName={CELL} />
        <ModeratorControls cellClassName={CELL} />
        <LeaveControl
          leaving={stage.leaving}
          onLeave={() => void stage.leave()}
          label={leaveLabel}
          cellClassName={cn(CELL, "ml-4")}
        />
      </footer>
    </div>
  );
}

/**
 * Chat and People as two tabs, or People alone where the room has no chat.
 *
 * **The chat stays mounted behind the People tab**, so a half-written message,
 * the log's scroll position and the live subscription all survive a look at the
 * people. It sits in an absolutely filled box so `h-full` has a definite height
 * to take, and that box's bottom padding is the line the chat's typing indicator
 * draws into.
 */
function SidePanel({
  chat,
  participantChatControls,
}: Pick<VoiceRoomRedesignProps, "chat" | "participantChatControls">) {
  const t = useTranslations("voice.stage");
  const [tab, setTab] = useState<"chat" | "people">("chat");
  const showChat = chat !== undefined && tab === "chat";

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border xl:w-96">
      {chat !== undefined && (
        <div role="tablist" className="flex shrink-0 gap-1 border-b border-border px-2 pt-1">
          <PanelTab selected={showChat} onSelect={() => setTab("chat")}>
            {t("chat")}
          </PanelTab>
          <PanelTab selected={!showChat} onSelect={() => setTab("people")}>
            {t("people")}
          </PanelTab>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        {chat !== undefined && (
          <div className={cn("absolute inset-0 px-2 pb-6 pt-2", !showChat && "hidden")}>
            {chat(CHAT_HEIGHT)}
          </div>
        )}
        <div className={cn("absolute inset-0 overflow-y-auto p-2", showChat && "hidden")}>
          <ParticipantList participantChatControls={participantChatControls} />
        </div>
      </div>
    </aside>
  );
}

/** Every tab sets one weight, so switching changes no label's width. */
function PanelTab({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "rounded-t-md border-b-2 px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act",
        selected
          ? "border-act text-act"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
