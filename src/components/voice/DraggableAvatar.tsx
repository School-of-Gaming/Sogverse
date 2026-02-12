"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Identicon } from "@/components/ui/identicon";
import { useVoiceRoom, type VoiceParticipant } from "./VoiceRoomProvider";
import {
  type SpatialPosition,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  AVATAR_SIZE,
  getZoneAtPosition,
} from "@/lib/constants/spatial";
import { SPEAKING_GLOW } from "@/lib/constants/spatial.config";

interface DraggableAvatarProps {
  participant: VoiceParticipant;
  position: SpatialPosition | undefined;
  canDrag: boolean;
}

export function DraggableAvatar({ participant, position, canDrag }: DraggableAvatarProps) {
  const { callObject, moveLocal, moveOther } = useVoiceRoom();
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragStartRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const draggingRef = useRef(false);
  const lastBroadcastRef = useRef(0);

  draggingRef.current = dragging;

  const pos = dragPos ?? position ?? { x: 0, y: 0 };

  // Clear dragPos when the provider's position prop catches up after drag ends.
  // Uses a ref for dragging so the effect only fires on position changes, not on drag state changes.
  useEffect(() => {
    if (!draggingRef.current) {
      setDragPos(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position]);

  // Attach video track when available
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!callObject || !videoEl || !participant.videoOn) {
      if (videoEl) videoEl.srcObject = null;
      return;
    }

    const pMap = callObject.participants();
    const dailyP = Object.values(pMap).find((p) => p.session_id === participant.sessionId);
    if (!dailyP) return;

    const videoTrack = dailyP.tracks.video;
    if (videoTrack?.state === "playable" && videoTrack.persistentTrack) {
      const existing = videoEl.srcObject instanceof MediaStream
        ? videoEl.srcObject.getVideoTracks()[0]
        : null;
      if (existing !== videoTrack.persistentTrack) {
        videoEl.srcObject = new MediaStream([videoTrack.persistentTrack]);
      }
    }
  }, [callObject, participant.sessionId, participant.videoOn]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!canDrag) return;
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current?.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;

      const currentX = pos.x;
      const currentY = pos.y;

      // Calculate offset from the pointer to the avatar's position
      const pointerX = (e.clientX - rect.left) * scaleX;
      const pointerY = (e.clientY - rect.top) * scaleY;
      dragStartRef.current = { offsetX: pointerX - currentX, offsetY: pointerY - currentY };

      setDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [canDrag, pos.x, pos.y]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !dragStartRef.current) return;
      e.preventDefault();

      const container = containerRef.current?.parentElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const scaleX = CANVAS_WIDTH / rect.width;
      const scaleY = CANVAS_HEIGHT / rect.height;

      let x = (e.clientX - rect.left) * scaleX - dragStartRef.current.offsetX;
      let y = (e.clientY - rect.top) * scaleY - dragStartRef.current.offsetY;

      // Clamp to canvas bounds
      x = Math.max(0, Math.min(CANVAS_WIDTH - AVATAR_SIZE, x));
      y = Math.max(0, Math.min(CANVAS_HEIGHT - AVATAR_SIZE, y));

      setDragPos({ x, y });

      // Broadcast position to other users (throttled ~20fps)
      const now = Date.now();
      if (now - lastBroadcastRef.current >= 50) {
        lastBroadcastRef.current = now;
        if (participant.isLocal) {
          moveLocal(x, y);
        } else {
          moveOther(participant.sessionId, x, y);
        }
      }
    },
    [dragging, participant.isLocal, participant.sessionId, moveLocal, moveOther]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setDragging(false);
      dragStartRef.current = null;

      if (!dragPos) return;

      const zone = getZoneAtPosition(dragPos.x, dragPos.y);

      // Gamers cannot enter broadcast zone — snap back
      if (participant.role === "gamer" && zone === "broadcast") {
        setDragPos(null);
        return;
      }

      // Send final position update
      if (participant.isLocal) {
        moveLocal(dragPos.x, dragPos.y);
      } else {
        moveOther(participant.sessionId, dragPos.x, dragPos.y);
      }

      // Don't clear dragPos here — the useEffect clears it when the
      // provider's position prop catches up, preventing snap-back.
    },
    [dragging, dragPos, participant, moveLocal, moveOther]
  );

  // Determine avatar size as percentage of canvas
  const sizePercW = (AVATAR_SIZE / CANVAS_WIDTH) * 100;
  const sizePercH = (AVATAR_SIZE / CANVAS_HEIGHT) * 100;

  return (
    <div
      ref={containerRef}
      className={cn(
        "absolute select-none",
        canDrag && !dragging && "cursor-grab",
        dragging && "cursor-grabbing z-50",
        !canDrag && "cursor-default"
      )}
      style={{
        left: `${(pos.x / CANVAS_WIDTH) * 100}%`,
        top: `${(pos.y / CANVAS_HEIGHT) * 100}%`,
        width: `${sizePercW}%`,
        height: `${sizePercH}%`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Avatar frame */}
      <div
        className={cn(
          "relative h-full w-full overflow-hidden rounded-md border-2 transition-shadow",
          participant.isSpeaking
            ? `${SPEAKING_GLOW.border} ${SPEAKING_GLOW.shadow}`
            : "border-border",
          participant.isLocal && "ring-1 ring-primary/30"
        )}
      >
        {participant.videoOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={participant.isLocal}
            className="h-full w-full object-cover"
          />
        ) : (
          <Identicon id={participant.userId} size={AVATAR_SIZE} />
        )}

        {/* Mic status overlay */}
        <div className="absolute bottom-0.5 right-0.5">
          {participant.audioOn ? (
            <Mic className="h-3 w-3 text-emerald-400 drop-shadow" />
          ) : (
            <MicOff className="h-3 w-3 text-destructive drop-shadow" />
          )}
        </div>
      </div>

      {/* Name label */}
      <p
        className={cn(
          "mt-0.5 truncate text-center text-[9px] font-medium leading-tight",
          participant.isLocal ? "text-primary" : "text-muted-foreground"
        )}
      >
        {participant.userName}
      </p>
    </div>
  );
}
