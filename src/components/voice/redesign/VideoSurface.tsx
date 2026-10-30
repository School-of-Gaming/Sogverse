"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useVoiceRoom } from "../VoiceRoomProvider";
import type { VoiceParticipant } from "../hooks/types";

/** Which of a person's two video tracks is being drawn. */
export type VideoSource = "camera" | "screen";

/**
 * Draws one person's video, filling the box it is put in: a camera cropped to
 * it, a screen shown whole, because cropping a share can cut off what is being
 * pointed at.
 */
export type RenderVideo = (
  participant: VoiceParticipant,
  source: VideoSource,
) => ReactNode;

/**
 * The element a person's video plays in, attached to their Daily track. Muted,
 * because remote audio plays through the pipeline's `<audio>` elements.
 */
function DailyVideo({
  participant,
  source,
}: {
  participant: VoiceParticipant;
  source: VideoSource;
}) {
  const { callObject } = useVoiceRoom();
  const videoRef = useRef<HTMLVideoElement>(null);
  const { sessionId } = participant;
  const live = source === "camera" ? participant.videoOn : participant.screenShareOn;

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!callObject || !live || !videoEl) return;
    const daily = Object.values(callObject.participants()).find(
      (p) => p.session_id === sessionId,
    );
    const track = source === "camera" ? daily?.tracks.video : daily?.tracks.screenVideo;
    if (track?.state === "playable" && track.persistentTrack) {
      videoEl.srcObject = new MediaStream([track.persistentTrack]);
    }
    return () => {
      videoEl.srcObject = null;
    };
  }, [callObject, live, sessionId, source]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={cn(
        "h-full w-full",
        source === "camera" ? "object-cover" : "object-contain",
      )}
    />
  );
}

const renderDailyVideo: RenderVideo = (participant, source) => (
  <DailyVideo participant={participant} source={source} />
);

const VideoSurfaceContext = createContext<RenderVideo>(renderDailyVideo);

/**
 * What the room's video is drawn with. Live rooms leave it alone and get the
 * Daily track; a preview scene has no call to attach to, so it supplies its own.
 */
export const VideoSurfaceProvider = VideoSurfaceContext.Provider;

export function useRenderVideo(): RenderVideo {
  return useContext(VideoSurfaceContext);
}
