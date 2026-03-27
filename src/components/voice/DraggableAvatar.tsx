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
  const { callObject, joined, moveLocal, moveOther, getPosition, participants } = useVoiceRoom();
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dragStartRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const dragPosRef = useRef<{ x: number; y: number } | null>(null);
  const lastBroadcastRef = useRef(0);

  // Position loop — runs per avatar but each tick is trivial (one ref read +
  // two style sets). The browser coalesces all rAF callbacks into a single
  // frame, so N avatars ≠ N frames. Same pattern as use-speaking-glow.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let rafId = 0;
    const tick = () => {
      const pos = dragPosRef.current ?? getPosition(participant.sessionId);
      el.style.left = `${(pos.x / CANVAS_WIDTH) * 100}%`;
      el.style.top = `${(pos.y / CANVAS_HEIGHT) * 100}%`;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [participant.sessionId, getPosition]);

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

      const pos = getPosition(participant.sessionId);
      const currentX = pos.x;
      const currentY = pos.y;

      const pointerX = (e.clientX - rect.left) * scaleX;
      const pointerY = (e.clientY - rect.top) * scaleY;
      dragStartRef.current = { offsetX: pointerX - currentX, offsetY: pointerY - currentY };

      setDragging(true);
      containerRef.current?.setPointerCapture(e.pointerId);
    },
    [canDrag, getPosition, participant.sessionId]
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

      dragPosRef.current = { x, y };

      // Broadcast position to other users (throttled ~30fps)
      const now = Date.now();
      if (now - lastBroadcastRef.current >= 33) {
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

      if (!dragPosRef.current) return;

      // Gamers cannot enter broadcast zone — push to nearest edge
      let dropX = dragPosRef.current.x;
      let dropY = dragPosRef.current.y;
      if (participant.role === "gamer") {
        const ejected = ejectFromBroadcastZone(dropX, dropY);
        dropX = ejected.x;
        dropY = ejected.y;
      }

      // Resolve overlap: read positions from the ref (always fresh)
      const others: { x: number; y: number }[] = [];
      for (const p of participants) {
        if (p.sessionId !== participant.sessionId) {
          others.push(getPosition(p.sessionId));
        }
      }
      const resolved = resolveOverlap(dropX, dropY, others);

      // Send final position update
      if (participant.isLocal) {
        moveLocal(resolved.x, resolved.y);
      } else {
        moveOther(participant.sessionId, resolved.x, resolved.y);
      }

      dragPosRef.current = null;
    },
    [dragging, participant, moveLocal, moveOther, participants, getPosition]
  );

  // Determine avatar size as percentage of canvas
  const sizePercW = (AVATAR_SIZE / CANVAS_WIDTH) * 100;
  const sizePercH = (AVATAR_SIZE / CANVAS_HEIGHT) * 100;
  const initialPos = getPosition(participant.sessionId);

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
        left: `${(initialPos.x / CANVAS_WIDTH) * 100}%`,
        top: `${(initialPos.y / CANVAS_HEIGHT) * 100}%`,
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
