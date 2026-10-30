"use client";

import { useState } from "react";
import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import { PanelBody, PanelTabs, type PanelTab } from "./ChatPeoplePanel";
import { DesktopZoneRail } from "./DesktopZoneRail";
import {
  CameraControl,
  LeaveControl,
  MicCell,
  ModeratorControls,
} from "./RoomControls";
import { TileStage } from "./TileStage";
import type { VoiceRoomRedesignProps } from "./types";
import type { RoomStage } from "./use-room-stage";
import { ZoneGlyph } from "./ZoneEntry";

const TILE_ASPECT = { min: 4 / 3, max: 16 / 9 };
const MIN_TILE_WIDTH = 200;
/** The rule in the column gap that sets Leave apart from what it sits beside. */
const LEAVE_CELL =
  "col-start-3 before:absolute before:inset-y-1 before:-left-1 before:w-px before:bg-border";

/**
 * The room on a wide screen: nothing scrolls but the panels, and there are no
 * site links, because a child clicking Shop would drop out of the call. The
 * zone you are in is the stage, between the left column and the chat and people
 * on the right, and all three run the full height under the top bar.
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
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {stage.currentZone && <ZoneGlyph zone={stage.currentZone} />}
          <p className="truncate text-sm font-medium">
            {t("stage.youAreIn", { zone: stage.currentZoneName })}
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-60 shrink-0 flex-col border-r border-border xl:w-64">
          <DesktopZoneRail stage={stage} />
          <RailControls stage={stage} leaveLabel={leaveLabel} />
        </div>
        <main className="min-w-0 flex-1 p-2">
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
    </div>
  );
}

/**
 * The controls at the foot of the left column, in three equal columns.
 *
 * **Everyone gets the row of mic, camera and Leave, and a moderator's or
 * trainee's three tools are one more row on top of it**, so the columns line up
 * and Leave is in the same corner for every viewer. The two start classes hold
 * that when a row is short: a viewer with Share alone, or a room with no camera.
 *
 * The column is 240px at the narrowest, which leaves 69px a cell inside the
 * padding and gaps, and 63px for a label. That holds French's longest labels on
 * two lines, and the longest single words in any locale ("vaimennus", at about
 * 61px) whole. Anything added to this grid does that arithmetic again.
 */
function RailControls({
  stage,
  leaveLabel,
}: {
  stage: RoomStage;
  leaveLabel: VoiceRoomRedesignProps["leaveLabel"];
}) {
  const t = useTranslations("voice.stage");
  return (
    <nav
      aria-label={t("controls")}
      className="grid shrink-0 grid-cols-3 gap-x-2 gap-y-1 border-t border-border p-2"
    >
      <ModeratorControls />
      <MicCell cellClassName="col-start-1" />
      <CameraControl />
      <LeaveControl
        leaving={stage.leaving}
        onLeave={() => void stage.leave()}
        label={leaveLabel}
        cellClassName={LEAVE_CELL}
      />
    </nav>
  );
}

function SidePanel({
  chat,
  participantChatControls,
}: Pick<VoiceRoomRedesignProps, "chat" | "participantChatControls">) {
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
        className="min-h-0 flex-1"
      />
    </aside>
  );
}
