"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Lock, Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { useSpeakingGlow } from "./hooks/use-speaking-glow";
import { PrivacyScreen } from "./PrivacyScreen";
import { ZoneDialog } from "./ZoneDialog";
import type { VoiceZoneView } from "@/lib/voice/zone-composition";
import type { VoiceParticipant, LockedMember } from "./hooks/types";
import type { VoiceZone } from "@/types";

// ---------------------------------------------------------------------------
// dnd-kit payload readers — `data.current` is untyped, so narrow by checking
// the discriminating fields for real (no casts). Unknown shapes return null and
// the handler no-ops; a drag must never throw.
// ---------------------------------------------------------------------------

interface MemberDrag {
  sessionId: string;
  userId: string;
  isLocal: boolean;
}

function readMemberDrag(value: unknown): MemberDrag | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("kind" in value) || value.kind !== "member") return null;
  if (!("sessionId" in value) || typeof value.sessionId !== "string") return null;
  if (!("userId" in value) || typeof value.userId !== "string") return null;
  if (!("isLocal" in value) || typeof value.isLocal !== "boolean") return null;
  return { sessionId: value.sessionId, userId: value.userId, isLocal: value.isLocal };
}

interface ZoneDrop {
  zoneId: string;
  isLocked: boolean;
}

function readZoneDrop(value: unknown): ZoneDrop | null {
  if (typeof value !== "object" || value === null) return null;
  if (!("kind" in value) || value.kind !== "zone") return null;
  if (!("zoneId" in value) || typeof value.zoneId !== "string") return null;
  if (!("isLocked" in value) || typeof value.isLocked !== "boolean") return null;
  return { zoneId: value.zoneId, isLocked: value.isLocked };
}

/**
 * Mobile-first vertical stack of zone cards — the pure-consumer UI for the
 * discrete-zone model (see CLAUDE.md). Tap a zone to move into it, or drag your
 * own avatar onto it; moderators can drag any avatar (onto a normal zone =
 * move, onto a locked zone = place). Locked zones the viewer is outside of show
 * a blurred DB roster behind a privacy screen.
 */
export function ZoneList() {
  const {
    zones,
    customZones,
    participants,
    participantsByZone,
    lockedRoster,
    currentZoneId,
    moveSelfToZone,
    moveParticipantToZone,
    placeInLockedZone,
    removeFromLockedZone,
    isModerator,
    groupId,
    deleteZone,
  } = useVoiceRoom();
  const t = useTranslations();
  const tv = useTranslations("voice");

  const [dialog, setDialog] = useState<
    | { kind: "create" }
    | { kind: "edit"; zone: VoiceZone }
    | { kind: "delete"; zone: VoiceZone }
    | null
  >(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  // Touch gets a short press-delay so dragging doesn't fight page scroll;
  // pointer (mouse) starts after a small movement so taps still register.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const canManage = isModerator && groupId !== null;

  // Gamers currently confined to a locked zone — so dragging one onto a normal
  // zone frees them (delete placement) before the move, instead of letting the
  // realtime auto-confine yank them back.
  const placedGamerIds = new Set<string>();
  for (const members of lockedRoster.values()) {
    for (const m of members) placedGamerIds.add(m.gamerId);
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveUserId(readMemberDrag(event.active.data.current)?.userId ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveUserId(null);
    const drag = readMemberDrag(event.active.data.current);
    const drop = event.over ? readZoneDrop(event.over.data.current) : null;
    if (!drag || !drop) return;

    if (drag.isLocal) {
      // Self-move (everyone). moveSelfToZone gates locked zones internally.
      moveSelfToZone(drop.zoneId);
      return;
    }

    // Moderator moving another participant (the tile is only draggable for them).
    if (drop.isLocked) {
      void placeInLockedZone(drag.userId, drop.zoneId);
    } else {
      if (placedGamerIds.has(drag.userId)) void removeFromLockedZone(drag.userId);
      moveParticipantToZone(drag.sessionId, drop.zoneId);
    }
  };

  // next-intl's message keys are typed literals, so resolve the fixed set of
  // virtual-zone labels with literal t() calls (a dynamic `t(zone.name)` won't
  // type-check). Custom zones carry their own literal name.
  const virtualLabels: Record<string, string> = {
    lobby: t("voice.zoneLobby"),
    "yty-harmony": t("yty.elements.harmony.name"),
    "yty-glow": t("yty.elements.glow.name"),
    "yty-valor": t("yty.elements.valor.name"),
    "yty-wit": t("yty.elements.wit.name"),
  };
  const labelFor = (zone: VoiceZoneView) =>
    zone.nameIsKey ? (virtualLabels[zone.id] ?? zone.id) : zone.name;

  const activeParticipant = participants.find((p) => p.userId === activeUserId) ?? null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="space-y-3">
        {zones.map((zone) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            members={participantsByZone.get(zone.id) ?? []}
            lockedMembers={lockedRoster.get(zone.id) ?? []}
            isCurrent={zone.id === currentZoneId}
            canDragOthers={isModerator}
            onEnter={zone.isLocked ? undefined : () => moveSelfToZone(zone.id)}
            label={labelFor(zone)}
            manage={
              canManage && zone.kind === "custom"
                ? {
                    onEdit: () => {
                      const row = customZones.find((z) => z.id === zone.id);
                      if (row) setDialog({ kind: "edit", zone: row });
                    },
                    onDelete: () => {
                      const row = customZones.find((z) => z.id === zone.id);
                      if (row) setDialog({ kind: "delete", zone: row });
                    },
                  }
                : undefined
            }
          />
        ))}

        {canManage && (
          <Button
            variant="outline"
            className="w-full gap-1.5 border-dashed"
            onClick={() => setDialog({ kind: "create" })}
          >
            <Plus className="h-4 w-4" />
            {tv("newZone")}
          </Button>
        )}

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
            title={tv("deleteZoneTitle")}
            description={tv("deleteZoneDescription")}
            confirmLabel={tv("deleteZoneConfirm")}
            onConfirm={() => void deleteZone(dialog.zone.id)}
          />
        )}
      </div>

      <DragOverlay>
        {activeParticipant && (
          <div className="h-12 w-12 overflow-hidden rounded-md border-2 border-primary shadow-lg">
            <Avatar className="h-12 w-12 rounded-md">
              <Identicon id={activeParticipant.userId} size={48} />
            </Avatar>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface ZoneCardProps {
  zone: VoiceZoneView;
  members: VoiceParticipant[];
  /** Outsider roster for a locked zone (from the DB), rendered blurred. */
  lockedMembers: LockedMember[];
  isCurrent: boolean;
  /** Whether the viewer (a moderator) may drag other participants' tiles. */
  canDragOthers: boolean;
  label: string;
  /** undefined → not tappable (locked zone). */
  onEnter?: () => void;
  /** Moderator edit/delete controls (custom zones only); undefined → hidden. */
  manage?: { onEdit: () => void; onDelete: () => void };
}

function ZoneCard({
  zone,
  members,
  lockedMembers,
  isCurrent,
  canDragOthers,
  label,
  onEnter,
  manage,
}: ZoneCardProps) {
  const t = useTranslations("voice");
  const Icon = zone.icon;
  const tappable = !!onEnter && !isCurrent;
  // Outsiders see a locked zone's roster from the DB (blurred); an insider
  // (the viewer is in this locked room) sees the real participants, no blur.
  const outsiderOfLocked = zone.isLocked && !isCurrent;
  const memberCount = outsiderOfLocked ? lockedMembers.length : members.length;

  const { setNodeRef, isOver } = useDroppable({
    id: `zone-${zone.id}`,
    data: { kind: "zone", zoneId: zone.id, isLocked: zone.isLocked },
  });

  return (
    <div
      ref={setNodeRef}
      role={tappable ? "button" : undefined}
      tabIndex={tappable ? 0 : undefined}
      onClick={tappable ? onEnter : undefined}
      onKeyDown={(e) => {
        if (!onEnter || isCurrent) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEnter();
        }
      }}
      aria-label={tappable ? t("joinZone", { zone: label }) : undefined}
      className={cn(
        "rounded-xl border p-3 transition-colors",
        isCurrent ? cn("ring-2", zone.color.ring) : "border-border",
        isOver && "ring-2 ring-primary bg-accent/40",
        tappable && "cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", zone.color.tile)}>
          <Icon className={cn("h-4 w-4", zone.color.glyph)} />
        </span>
        <span className="flex-1 truncate text-sm font-medium">{label}</span>
        {zone.isLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
        {isCurrent ? (
          <Badge variant="secondary" className="text-xs">{t("youAreHere")}</Badge>
        ) : (
          <Badge variant="outline" className="text-xs">
            {t("participantsCount", { count: memberCount })}
          </Badge>
        )}
        {manage && (
          <div className="flex items-center gap-0.5">
            {/* stopPropagation so these don't trigger the card's tap-to-enter. */}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                manage.onEdit();
              }}
              title={t("editZone")}
              aria-label={t("editZone")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                manage.onDelete();
              }}
              title={t("deleteZoneConfirm")}
              aria-label={t("deleteZoneConfirm")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Locked zone (outsider view): blurred roster from the DB placements. The
          real privacy is the separate Daily room; the blur is the UI signal.
          An insider sees the real members below instead. */}
      {outsiderOfLocked ? (
        lockedMembers.length > 0 && (
          <div className="relative mt-3">
            <div className="flex flex-wrap gap-3">
              {lockedMembers.map((m) => (
                <LockedMemberTile key={m.gamerId} gamerId={m.gamerId} />
              ))}
            </div>
            <PrivacyScreen />
          </div>
        )
      ) : (
        members.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {members.map((p) => (
              <ZoneMemberTile key={p.sessionId} participant={p} canDragOthers={canDragOthers} />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function LockedMemberTile({ gamerId }: { gamerId: string }) {
  return (
    <div className="flex w-14 flex-col items-center gap-1">
      <div className="rounded-md border-2 border-border">
        <Avatar className="h-12 w-12 rounded-md">
          <Identicon id={gamerId} size={48} />
        </Avatar>
      </div>
    </div>
  );
}

function ZoneMemberTile({
  participant: p,
  canDragOthers,
}: {
  participant: VoiceParticipant;
  canDragOthers: boolean;
}) {
  const t = useTranslations("voice");
  const { callObject } = useVoiceRoom();
  const glowRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useSpeakingGlow(glowRef, p.sessionId, p.audioOn);

  // Everyone can drag their own tile; moderators can drag anyone's.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member-${p.sessionId}`,
    data: { kind: "member", sessionId: p.sessionId, userId: p.userId, isLocal: p.isLocal },
    disabled: !p.isLocal && !canDragOthers,
  });
  const draggable = p.isLocal || canDragOthers;

  // Attach the participant's camera track to the tile when their video is on —
  // video replaces the identicon in place at the same size. The element is
  // muted; remote audio plays through the pipeline's <audio> elements, not here.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!callObject || !p.videoOn || !videoEl) return;
    const dp = Object.values(callObject.participants()).find(
      (x) => x.session_id === p.sessionId,
    );
    const track = dp?.tracks.video;
    if (track?.state === "playable" && track.persistentTrack) {
      videoEl.srcObject = new MediaStream([track.persistentTrack]);
    }
    return () => {
      videoEl.srcObject = null;
    };
  }, [callObject, p.sessionId, p.videoOn]);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // No `touch-action: none` here on purpose: the TouchSensor uses a press
      // delay, so the browser must keep handling scroll until the delay elapses.
      // touch-action:none would block page scroll whenever a swipe starts on a tile.
      className={cn(
        "flex w-14 flex-col items-center gap-1",
        draggable && "cursor-grab",
        isDragging && "opacity-50",
      )}
    >
      <div
        ref={glowRef}
        className={cn(
          "h-12 w-12 overflow-hidden rounded-md border-2 border-border transition-shadow",
          p.isLocal && "ring-1 ring-primary/30",
        )}
      >
        {p.videoOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        ) : (
          <Avatar className="h-12 w-12 rounded-md">
            <Identicon id={p.userId} size={48} />
          </Avatar>
        )}
      </div>
      <span className="w-full truncate text-center text-[10px] leading-tight">
        {p.userName}
        {p.isLocal && <span className="text-muted-foreground"> {t("you")}</span>}
      </span>
    </div>
  );
}
