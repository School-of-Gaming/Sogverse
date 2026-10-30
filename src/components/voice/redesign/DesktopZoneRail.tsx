"use client";

import { useId, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import type { VoiceZoneView } from "@/lib/voice/zone-composition";
import type { VoiceParticipant } from "../hooks/types";
import { VoiceAvatar } from "../VoiceAvatar";
import { useVoiceRoom } from "../VoiceRoomProvider";
import { readMemberDrag, readZoneDrop } from "../ZoneList";
import { useParticipantGlow } from "./use-participant-glow";
import type { RoomStage } from "./use-room-stage";
import { useZoneManagement } from "./use-zone-management";
import { useRenderVideo } from "./VideoSurface";
import { ZoneEntry } from "./ZoneEntry";

/**
 * The left rail: every zone, with its members small, where the stage is your
 * own zone's members big. Tap a zone to move in, or drag your avatar onto it;
 * moderators drag any avatar, onto a normal zone to move and a private one to
 * place. The same semantics as `ZoneList`.
 */
export function DesktopZoneRail({ stage }: { stage: RoomStage }) {
  const t = useTranslations("voice");
  const {
    zones,
    participants,
    participantsByZone,
    currentZoneId,
    moveParticipantToZone,
    isModerator,
  } = useVoiceRoom();
  const { manageFor, newZone, dialogs } = useZoneManagement();

  // dnd-kit's own id counter differs between server and hydration; `useId` does not.
  const dndId = useId();
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  // 5px of movement starts a drag, so a tap on an avatar still enters the zone.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveUserId(readMemberDrag(event.active.data.current)?.userId ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveUserId(null);
    const drag = readMemberDrag(event.active.data.current);
    const drop = event.over ? readZoneDrop(event.over.data.current) : null;
    if (!drag || !drop) return;
    if (!drag.isLocal) {
      moveParticipantToZone(drag.sessionId, drag.userId, drop.zoneId);
      return;
    }
    const zone = zones.find((z) => z.id === drop.zoneId);
    if (zone && stage.canEnter(zone)) stage.enterZone(zone.id);
  };

  const activeParticipant = participants.find((p) => p.userId === activeUserId) ?? null;

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveUserId(null)}
    >
      <aside
        aria-label={t("stage.zones")}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
      >
        {zones.map((zone) => (
          <RailZone
            key={zone.id}
            zone={zone}
            members={participantsByZone.get(zone.id) ?? []}
            isCurrent={zone.id === currentZoneId}
            canDragOthers={isModerator}
            selfLocked={stage.isConfined}
            label={stage.zoneLabel(zone)}
            onEnter={stage.canEnter(zone) ? () => stage.enterZone(zone.id) : undefined}
            manage={manageFor(zone)}
          />
        ))}
        {newZone}
        {dialogs}
      </aside>

      <DragOverlay dropAnimation={null}>
        {activeParticipant && (
          <div className="drag-ghost flex w-12 flex-col items-center gap-1">
            <VoiceAvatar
              userId={activeParticipant.userId}
              className="shadow-lg"
            />
            <span className="w-full truncate text-center text-[10px] leading-tight">
              {activeParticipant.userName}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function RailZone({
  zone,
  members,
  isCurrent,
  canDragOthers,
  selfLocked,
  label,
  onEnter,
  manage,
}: {
  zone: VoiceZoneView;
  members: VoiceParticipant[];
  isCurrent: boolean;
  canDragOthers: boolean;
  selfLocked: boolean;
  label: string;
  onEnter?: () => void;
  manage: ReturnType<ReturnType<typeof useZoneManagement>["manageFor"]>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `zone-${zone.id}`,
    data: { kind: "zone", zoneId: zone.id, isLocked: zone.isLocked },
  });
  // A non-moderator never self-enters a private zone, so it never lights up for them.
  const canDropHere = canDragOthers || !zone.isLocked;

  return (
    <ZoneEntry
      zone={zone}
      label={label}
      occupied={members.length > 0}
      isCurrent={isCurrent}
      isDropTarget={isOver && canDropHere}
      onEnter={onEnter}
      manage={manage}
      rootRef={setNodeRef}
    >
      {members.map((p) => (
        <RailMember
          key={p.sessionId}
          participant={p}
          draggable={p.isLocal ? !selfLocked : canDragOthers}
          // Your own zone's people are already on the stage, and a private
          // zone's are not sent to an outsider.
          showVideo={!isCurrent && !zone.isLocked}
        />
      ))}
    </ZoneEntry>
  );
}

function RailMember({
  participant: p,
  draggable,
  showVideo,
}: {
  participant: VoiceParticipant;
  draggable: boolean;
  showVideo: boolean;
}) {
  const renderVideo = useRenderVideo();
  const { glowRef, steadyGlow } = useParticipantGlow(p);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member-${p.sessionId}`,
    data: { kind: "member", sessionId: p.sessionId, userId: p.userId, isLocal: p.isLocal },
    disabled: !draggable,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      title={p.userName}
      style={steadyGlow}
      className={cn(
        "shrink-0 rounded-md",
        // The next avatar would otherwise paint over this one's glow.
        p.isSpeaking && "relative z-10",
        draggable && "drag-handle touch-none",
        isDragging && "opacity-50",
      )}
    >
      <VoiceAvatar
        ref={glowRef}
        userId={p.userId}
        videoOn={p.videoOn && showVideo}
        isLocal={p.isLocal}
        className="h-7 w-7 border border-border"
      >
        {renderVideo(p, "camera")}
      </VoiceAvatar>
    </div>
  );
}
