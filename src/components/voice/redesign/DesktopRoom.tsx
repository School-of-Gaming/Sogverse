"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { PanelBody, PanelTabs, type PanelTab } from "./ChatPeoplePanel";
import { DesktopZoneRail } from "./DesktopZoneRail";
import {
  CameraControl,
  LeaveControl,
  MicCell,
  ModeratorControls,
  useHasControlsBesideShare,
} from "./RoomControls";
import { TileStage } from "./TileStage";
import type { VoiceRoomRedesignProps } from "./types";
import type { RoomStage } from "./use-room-stage";

const TILE_ASPECT = { min: 4 / 3, max: 16 / 9 };
const MIN_TILE_WIDTH = 200;
/** The rule in the gap that sets Leave apart from what it sits beside. */
const LEAVE_RULE =
  "before:absolute before:inset-y-1 before:-left-1 before:w-px before:bg-border";
const ONE_ROW_CELL = "min-w-0 flex-1";

/**
 * The room on a wide screen: nothing scrolls but the panels. The zone you are in
 * is the stage, between the left column and the chat and people on the right, and
 * all three run the full height under the site header.
 */
export function DesktopRoom({
  stage,
  chat,
  participantChatControls,
  participantShareControls,
  shareLocked,
  leaveLabel,
}: VoiceRoomRedesignProps & { stage: RoomStage }) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-80 shrink-0 flex-col border-r border-border xl:w-96">
        <DesktopZoneRail stage={stage} />
        <RailControls stage={stage} shareLocked={shareLocked} leaveLabel={leaveLabel} />
      </div>
      <main className="min-w-0 flex-1 p-2">
        <TileStage
          members={stage.stageMembers}
          presenter={stage.presenter}
          bigShare={stage.bigShare}
          otherShares={stage.otherShares}
          onShowShare={stage.showShare}
          shareLayout="strip"
          tileAspect={TILE_ASPECT}
          minTileWidth={MIN_TILE_WIDTH}
        />
      </main>
      <SidePanel
        chat={chat}
        participantChatControls={participantChatControls}
        participantShareControls={participantShareControls}
      />
    </div>
  );
}

/**
 * The controls at the foot of the left column, with Leave last and in the same
 * corner for every viewer.
 *
 * **Six controls are two rows of three, and fewer are one row of equal cells.**
 * A moderator's or trainee's Share, Broadcast and Deafen sit above Mic, Camera
 * and Leave. Anyone else has Mic, Camera, Share and Leave at most, on one row.
 *
 * The narrowest column is 320px, which leaves four cells 69.75px each and 65.75px
 * for a label. Measured in every locale, each label fits on two lines at most, and
 * the tightest word is Finnish "jakaminen" at 64.7px, so a label a word longer
 * than that breaks mid-word. Anything added to this row does that arithmetic again.
 */
function RailControls({
  stage,
  shareLocked,
  leaveLabel,
}: Pick<VoiceRoomRedesignProps, "shareLocked" | "leaveLabel"> & {
  stage: RoomStage;
}) {
  const t = useTranslations("voice.stage");
  const twoRows = useHasControlsBesideShare();
  return (
    <nav
      aria-label={t("controls")}
      className={cn(
        "shrink-0 gap-2 border-t border-border p-2",
        twoRows ? "grid grid-cols-3 gap-y-1" : "flex",
      )}
    >
      {twoRows && <ModeratorControls shareLocked={shareLocked} />}
      <MicCell cellClassName={twoRows ? undefined : ONE_ROW_CELL} />
      <CameraControl cellClassName={twoRows ? undefined : ONE_ROW_CELL} />
      {!twoRows && <ModeratorControls cellClassName={ONE_ROW_CELL} shareLocked={shareLocked} />}
      <LeaveControl
        leaving={stage.leaving}
        onLeave={() => void stage.leave()}
        label={leaveLabel}
        cellClassName={cn(LEAVE_RULE, twoRows ? "col-start-3" : ONE_ROW_CELL)}
      />
    </nav>
  );
}

function SidePanel({
  chat,
  participantChatControls,
  participantShareControls,
}: Pick<
  VoiceRoomRedesignProps,
  "chat" | "participantChatControls" | "participantShareControls"
>) {
  const [tab, setTab] = useState<PanelTab>("chat");

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border xl:w-96">
      {chat !== undefined && (
        <div className="shrink-0 border-b border-border px-2 pt-1">
          <PanelTabs tab={tab} onSelect={setTab} />
        </div>
      )}
      <PanelBody
        tab={tab}
        chat={chat}
        participantChatControls={participantChatControls}
        participantShareControls={participantShareControls}
        className="min-h-0 flex-1"
      />
    </aside>
  );
}
