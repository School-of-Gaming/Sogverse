"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useVoiceRoom, type VoiceParticipant } from "./VoiceRoomProvider";
import { VoiceAvatar } from "./VoiceAvatar";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  AVATAR_SIZE,
  resolveOverlap,
  ejectFromBroadcastZone,
} from "@/lib/constants/spatial";
import { useSpeakingGlow } from "./hooks/use-speaking-glow";

interface DraggableAvatarProps {
  participant: VoiceParticipant;
  canDrag: boolean;
}

export const DraggableAvatar = memo(function DraggableAvatar({ participant, canDrag }: DraggableAvatarProps) {
  const { callObject, joined, moveLocal, moveOther, participants } = useVoiceRoom();
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragStartRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const lastBroadcastRef = useRef(0);

  // Clear stale dragPos when the provider's position catches up after drag ends.
  // Uses the React "adjust state during render" pattern instead of an effect.
  const [prevPosKey, setPrevPosKey] = useState("");
  const posKey = `${participant.position.x},${participant.position.y}`;
  if (posKey !== prevPosKey) {
    setPrevPosKey(posKey);
    if (!dragging) {
      setDragPos(null);
    }
  }

  const pos = dragPos ?? participant.position;

  // Attach video track when available
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!callObject || !joined || !videoEl || !participant.videoOn) {
      if (videoEl) videoEl.srcObject = null;
      return;
    }

    const pMap = callObject.participants();
    const dailyP = Object.values(pMap).find((p) => p.session_id === participant.sessionId);
    if (!dailyP) return;

    const videoTrack = dailyP.tracks.video;
    if (videoTrack.state === "playable" && videoTrack.persistentTrack) {
      const existing = videoEl.srcObject instanceof MediaStream
        ? videoEl.srcObject.getVideoTracks()[0]
        : null;
      if (existing !== videoTrack.persistentTrack) {
        videoEl.srcObject = new MediaStream([videoTrack.persistentTrack]);
      }
    }
  }, [callObject, joined, participant.sessionId, participant.videoOn]);

  useSpeakingGlow(frameRef, participant.sessionId, participant.audioOn);

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
      containerRef.current?.setPointerCapture(e.pointerId);
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

      // Only mods can enter the broadcast zone — push everyone else (gamers,
      // guests on instant rooms) to the nearest edge.
      let dropX = dragPos.x;
      let dropY = dragPos.y;
      const isMod = participant.role === "admin" || participant.role === "gedu";
      if (!isMod) {
        const ejected = ejectFromBroadcastZone(dropX, dropY);
        dropX = ejected.x;
        dropY = ejected.y;
      }

      // Resolve overlap: nudge so avatars don't stack on top of each other
      const others: { x: number; y: number }[] = [];
      for (const p of participants) {
        if (p.sessionId !== participant.sessionId) {
          others.push(p.position);
        }
      }
      const resolved = resolveOverlap(dropX, dropY, others);
      setDragPos(resolved);

      // Send final position update
      if (participant.isLocal) {
        moveLocal(resolved.x, resolved.y);
      } else {
        moveOther(participant.sessionId, resolved.x, resolved.y);
      }

      // Don't clear dragPos here — it gets cleared during render when
      // the provider's position prop catches up, preventing snap-back.
    },
    [dragging, dragPos, participant, moveLocal, moveOther, participants]
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
      <VoiceAvatar
        ref={frameRef}
        userId={participant.userId}
        userName={participant.userName}
        audioOn={participant.audioOn}
        videoOn={participant.videoOn}
        isLocal={participant.isLocal}
      >
        {participant.videoOn && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={participant.isLocal}
            className="h-full w-full object-cover"
          />
        )}
      </VoiceAvatar>
    </div>
  );
});
