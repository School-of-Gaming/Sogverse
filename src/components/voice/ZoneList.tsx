"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { ChevronLeft, ChevronRight, Lock, Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { useSpeakingGlow } from "./hooks/use-speaking-glow";
import { PrivacyScreen } from "./PrivacyScreen";
import { VoiceAvatar } from "./VoiceAvatar";
import { ZoneDialog } from "./ZoneDialog";
import type { VoiceZoneView } from "@/lib/voice/zone-composition";
import type { VoiceParticipant } from "./hooks/types";
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
 * move, onto a locked zone = place). A private (locked) zone the viewer is
 * outside of renders its occupants — live Daily participants, just with no
 * media (SFU-blocked) — behind a privacy screen.
 */
export function ZoneList() {
  const {
    zones,
    customZones,
    participants,
    participantsByZone,
    currentZoneId,
    moveSelfToZone,
    moveParticipantToZone,
    placeInPrivateZone,
    removeFromPrivateZone,
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

  // A single PointerSensor (mouse + touch): a 5px movement starts a drag, so a
  // tap still registers and an avatar is picked up immediately (no press-and-
  // hold). The draggable tiles set `touch-action: none`, so a touch landing on a
  // movable avatar drags it instead of scrolling. Because a crowded row is *all*
  // draggable avatars (no gap to swipe), horizontal scrolling is driven by the
  // explicit chevron buttons in MemberArea, not by swiping the strip.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const canManage = isModerator && groupId !== null;

  // A gamer placed in a private zone is "locked in place" — only a moderator can
  // move them out. So no zone is tappable for them and their own avatar isn't
  // draggable (no fake affordance); both return the moment they're freed.
  const currentZone = zones.find((z) => z.id === currentZoneId);
  const isConfinedGamer = !isModerator && !!currentZone?.isLocked;

  // Users currently in a private zone (bucketed there by their occupancy row) —
  // so dragging one onto a normal zone frees them (clears occupancy) before the
  // move, instead of letting the realtime auto-confine pull them back.
  const placedUserIds = new Set<string>();
  for (const zone of zones) {
    if (!zone.isLocked) continue;
    for (const m of participantsByZone.get(zone.id) ?? []) placedUserIds.add(m.userId);
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
      void placeInPrivateZone(drag.userId, drop.zoneId);
    } else {
      if (placedUserIds.has(drag.userId)) void removeFromPrivateZone(drag.userId);
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
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveUserId(null)}
    >
      <div className="space-y-2">
        {zones.map((zone) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            members={participantsByZone.get(zone.id) ?? []}
            isCurrent={zone.id === currentZoneId}
            canDragOthers={isModerator}
            selfLocked={isConfinedGamer}
            // Tap to enter, mirroring drag-to-enter. Not tappable when there's no
            // valid self-move: a confined gamer can't leave their private zone
            // (mod-only), and no one can self-enter a locked zone except a
            // moderator. moveSelfToZone would no-op anyway — don't show a fake
            // affordance (cursor/hover).
            onEnter={
              isConfinedGamer || (zone.isLocked && !isModerator)
                ? undefined
                : () => moveSelfToZone(zone.id)
            }
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

      {/* dropAnimation={null}: by default dnd-kit flies the overlay back to the
          source tile's old position on release. Since a successful drop moves the
          avatar to a *different* zone, that animation reads as the ghost snapping
          back to where it started — drop instantly instead. */}
      <DragOverlay dropAnimation={null}>
        {activeParticipant && (
          // Mirror the member tile (avatar + name) so the whole thing lifts as a
          // unit, not just the icon. `drag-ghost` (globals.css) makes it read as
          // grabbing — dnd-kit puts no cursor on the overlay, and it sits right
          // under the pointer mid-drag.
          <div className="drag-ghost flex w-12 flex-col items-center gap-1">
            <VoiceAvatar userId={activeParticipant.userId} className="border-primary shadow-lg" />
            <span className="w-full truncate text-center text-[10px] leading-tight">
              {activeParticipant.userName}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface ZoneCardProps {
  zone: VoiceZoneView;
  members: VoiceParticipant[];
  isCurrent: boolean;
  /** Whether the viewer (a moderator) may drag other participants' tiles. */
  canDragOthers: boolean;
  /** The viewer is a gamer confined to a private zone → their own avatar isn't
   *  draggable (they can't self-move out). */
  selfLocked: boolean;
  label: string;
  /** undefined → not tappable (a private zone a gamer can't self-enter). */
  onEnter?: () => void;
  /** Moderator edit/delete controls (custom zones only); undefined → hidden. */
  manage?: { onEdit: () => void; onDelete: () => void };
}

function ZoneCard({
  zone,
  members,
  isCurrent,
  canDragOthers,
  selfLocked,
  label,
  onEnter,
  manage,
}: ZoneCardProps) {
  const t = useTranslations("voice");
  const Icon = zone.icon;
  const tappable = !!onEnter && !isCurrent;
  // A custom zone may have a blank name — it's then identified by icon + color
  // alone. Fall back to a generic word only for the accessible (aria) label;
  // the visible label area simply stays empty.
  const accessibleLabel = label || t("unnamedZone");
  // An outsider to a private zone sees its occupants (live Daily participants,
  // but SFU-blocked → no video/audio/glow) blurred behind the PrivacyScreen; an
  // insider (the viewer is in this private zone) sees them normally, no blur.
  const outsiderOfLocked = zone.isLocked && !isCurrent;
  // Whether the avatar being dragged could actually land here. A non-moderator
  // can only self-move into normal zones (locked zones are placed-into by mods,
  // never self-entered), so a private zone isn't a valid drop for them — don't
  // light up the drop ring there. Moderators can drop anyone anywhere.
  const canDropHere = canDragOthers || !zone.isLocked;

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
      aria-label={tappable ? t("joinZone", { zone: accessibleLabel }) : undefined}
      className={cn(
        "rounded-xl border px-3 py-2.5 transition-colors",
        // Active zone: high-contrast border to mark "you're here" (vs the muted
        // grey of the others), with the zone's color spilling in from the edge
        // via an inset-shadow glow. Non-active: muted grey border.
        isCurrent ? cn("border-foreground", zone.color.glow) : "border-border",
        isOver && canDropHere && "ring-2 ring-primary bg-accent/40",
        tappable && "cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", zone.color.tile)}>
          <Icon className={cn("h-5 w-5", zone.color.glyph)} />
        </span>
        <span className="flex-1 truncate text-sm font-medium">{label}</span>
        {zone.isLocked && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            <Lock className="h-2.5 w-2.5" />
            {t("privateZone")}
          </span>
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

      {/* Member roster. Always rendered at a fixed reserved height (even empty)
          so a card's height never changes as people move between zones — that
          constant height is the whole point of MemberArea. A private zone an
          outsider can't enter renders its occupants blurred behind the
          PrivacyScreen (the occupants are real Daily participants — only their
          media is SFU-blocked); an insider sees them unblurred. */}
      <MemberArea count={members.length} privacy={outsiderOfLocked}>
        {members.map((p) => (
          <ZoneMemberTile
            key={p.sessionId}
            participant={p}
            canDragOthers={canDragOthers}
            selfLocked={selfLocked}
            privacyMasked={outsiderOfLocked}
          />
        ))}
      </MemberArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member roster strip.
//
// Each zone reserves a fixed-height member area whether or not anyone is in it,
// so a card's height never changes as people move between zones (the whole
// stack would otherwise reflow). When more avatars are present than fit, the
// row scrolls horizontally and the overflowing edge(s) fade out — the same
// "there's more to scroll" cue the session calendar uses — instead of wrapping
// (which grows the card) or overlapping (which would hide names). Names are
// always kept.
// ---------------------------------------------------------------------------

// Width of the fade ramp at each scrollable edge — wide enough that the edge
// clearly dissolves (a thin ramp reads as a hard cut, not a "more to scroll"
// cue).
const MEMBER_FADE = "100px";

// Scroll-chevron behavior: a single click nudges ~one avatar (tile w-12 + the
// gap-1 between tiles); pressing and holding past the delay scrolls smoothly and
// continuously at the per-frame speed until released or the edge is reached.
const MEMBER_STEP_PX = 52;
const MEMBER_HOLD_SPEED_PX = 7;
const MEMBER_HOLD_DELAY_MS = 200;

function MemberArea({
  count,
  privacy = false,
  children,
}: {
  count: number;
  privacy?: boolean;
  children: ReactNode;
}) {
  const tv = useTranslations("voice");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  // Chevron scroll: a click steps one avatar; a press-and-hold scrolls smoothly.
  // The row is all draggable avatars (no gap to swipe), so these are the scroll
  // affordance. `pressed` guards against a stray double end (e.g. pointercancel
  // after pointerup); `active` marks that the continuous loop took over, so the
  // release is NOT also treated as a single-step click.
  const holdRef = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    raf: number;
    active: boolean;
    pressed: boolean;
  }>({ timer: null, raf: 0, active: false, pressed: false });

  const startHold = (dir: number) => {
    const s = holdRef.current;
    if (s.timer) clearTimeout(s.timer);
    cancelAnimationFrame(s.raf);
    s.active = false;
    s.pressed = true;
    s.timer = setTimeout(() => {
      s.active = true;
      const tick = () => {
        const el = scrollRef.current;
        if (!el) return;
        const before = el.scrollLeft;
        el.scrollLeft += dir * MEMBER_HOLD_SPEED_PX;
        if (el.scrollLeft === before) {
          // Hit the edge — stop the loop (the button itself will hide).
          s.active = false;
          s.pressed = false;
          return;
        }
        s.raf = requestAnimationFrame(tick);
      };
      s.raf = requestAnimationFrame(tick);
    }, MEMBER_HOLD_DELAY_MS);
  };

  const endHold = (dir: number) => {
    const s = holdRef.current;
    if (!s.pressed) return;
    s.pressed = false;
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
    cancelAnimationFrame(s.raf);
    if (!s.active) {
      // Released before the hold engaged → treat as a click: one avatar.
      scrollRef.current?.scrollBy({ left: dir * MEMBER_STEP_PX, behavior: "smooth" });
    }
    s.active = false;
  };

  // Stop any in-flight hold if the area unmounts mid-press.
  useEffect(() => {
    const s = holdRef.current;
    return () => {
      if (s.timer) clearTimeout(s.timer);
      cancelAnimationFrame(s.raf);
    };
  }, []);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const start = el.scrollLeft > 1;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setEdges((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end },
    );
  }, []);

  // Recompute on mount, on resize, and whenever the roster size changes: a
  // join/leave changes scrollWidth, which a ResizeObserver on the strip itself
  // can't observe (its own box size is unchanged), so `count` drives a re-run.
  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, count]);

  // Fade only the side that has more to reveal — left once scrolled off the
  // start, right while content remains past the end. A mask (vs. the calendar's
  // colored gradient) is background-agnostic, so it works over the card's
  // hover/active background changes.
  const maskImage = `linear-gradient(to right, ${
    edges.start ? "transparent" : "black"
  } 0, black ${MEMBER_FADE}, black calc(100% - ${MEMBER_FADE}), ${
    edges.end ? "transparent" : "black"
  })`;

  return (
    <div className="relative h-[68px]">
      <div
        ref={scrollRef}
        onScroll={update}
        style={{ maskImage, WebkitMaskImage: maskImage }}
        className="flex h-full items-start gap-1 overflow-x-auto pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      {/* Chevron scroll buttons — the row is all draggable avatars, so it can't
          be swipe-scrolled; these are the scroll affordance. Each shows only
          when there's more to reveal that way (reusing the same edge state that
          drives the fade), sits over the faded edge, and `stopPropagation`s so a
          tap scrolls without also entering the zone. */}
      {edges.start && (
        <button
          type="button"
          aria-label={tv("scrollMembersLeft")}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            startHold(-1);
          }}
          onPointerUp={() => endHold(-1)}
          onPointerCancel={() => endHold(-1)}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0.5 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent touch-none"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {edges.end && (
        <button
          type="button"
          aria-label={tv("scrollMembersRight")}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            startHold(1);
          }}
          onPointerUp={() => endHold(1)}
          onPointerCancel={() => endHold(1)}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0.5 top-1/2 z-10 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-colors hover:bg-accent touch-none"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {privacy && count > 0 && <PrivacyScreen />}
    </div>
  );
}

function ZoneMemberTile({
  participant: p,
  canDragOthers,
  selfLocked = false,
  privacyMasked = false,
}: {
  participant: VoiceParticipant;
  canDragOthers: boolean;
  /** The viewer is a confined gamer → their own tile isn't draggable. */
  selfLocked?: boolean;
  /** This tile is a private-zone occupant seen by an outsider: their media is
   *  SFU-blocked, so the "live" audio/video state isn't real. Omit the mic state
   *  so they're never shown as muted just because we can't receive their track. */
  privacyMasked?: boolean;
}) {
  const t = useTranslations("voice");
  const { callObject } = useVoiceRoom();
  const glowRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  useSpeakingGlow(glowRef, p.sessionId, p.audioOn);

  // Everyone can drag their own tile; moderators can drag anyone's. A confined
  // gamer is the exception — they can't move themselves out, so their own tile
  // is not draggable (`selfLocked`).
  const selfDraggable = p.isLocal && !selfLocked;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `member-${p.sessionId}`,
    data: { kind: "member", sessionId: p.sessionId, userId: p.userId, isLocal: p.isLocal },
    disabled: !selfDraggable && !canDragOthers,
  });
  const draggable = selfDraggable || canDragOthers;

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
      // `touch-action: none` on draggable tiles so a touch that lands on a
      // movable avatar drags it immediately rather than panning. Scrolling a
      // crowded (all-draggable) row is handled by the chevron buttons in
      // MemberArea, not by swiping. `shrink-0` keeps avatars full-size so the
      // row overflows into a scroll instead of squishing the tiles.
      className={cn(
        "flex w-12 shrink-0 flex-col items-center gap-1",
        // Shared drag-cursor classes (defined in globals.css): grab on hover.
        draggable && "drag-handle touch-none",
        isDragging && "opacity-50",
      )}
    >
      <VoiceAvatar
        ref={glowRef}
        userId={p.userId}
        audioOn={privacyMasked ? undefined : p.audioOn}
        videoOn={p.videoOn}
        isLocal={p.isLocal}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      </VoiceAvatar>
      <span className="w-full truncate text-center text-[10px] leading-tight">
        {p.userName}
        {p.isLocal && <span className="text-muted-foreground"> {t("you")}</span>}
      </span>
    </div>
  );
}
