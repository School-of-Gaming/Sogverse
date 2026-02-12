"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useVoiceRoom, type VoiceParticipant } from "./VoiceRoomProvider";
import { VoiceAvatar } from "./VoiceAvatar";
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
  const { callObject, moveLocal, moveOther, getAnalyser } = useVoiceRoom();
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
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

  // Animate speaking glow based on real-time audio level (DOM manipulation, no React re-renders)
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const dataArray = new Uint8Array(256);
    let rafId = 0;

    const tick = () => {
      const analyser = getAnalyser(participant.sessionId);
      if (analyser) {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(1, rms * 3);

        if (level > 0.05) {
          const spread = level * SPEAKING_GLOW.maxSpread;
          const opacity = 0.3 + level * 0.5;
          frame.style.boxShadow = `0 0 ${spread}px rgba(${SPEAKING_GLOW.color}, ${opacity})`;
          frame.style.borderColor = `rgba(${SPEAKING_GLOW.color}, ${0.5 + level * 0.5})`;
        } else {
          frame.style.boxShadow = "";
          frame.style.borderColor = "";
        }
      } else {
        frame.style.boxShadow = "";
        frame.style.borderColor = "";
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [getAnalyser, participant.sessionId]);

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
}
