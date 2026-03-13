"use client";

import { useEffect, useRef } from "react";
import { useVoiceRoom } from "./VoiceRoomProvider";

interface VideoTileProps {
  /** Session ID of the participant whose video to show */
  sessionId: string;
  className?: string;
}

/**
 * Renders a participant's camera feed using Daily.co's video track.
 * Typically used for the gedu's camera.
 */
export function VideoTile({ sessionId, className }: VideoTileProps) {
  const { callObject, joined, participants } = useVoiceRoom();
  const videoRef = useRef<HTMLVideoElement>(null);

  const participant = participants.find((p) => p.sessionId === sessionId);
  const hasVideo = participant?.videoOn ?? false;

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!callObject || !joined || !videoEl || !hasVideo) {
      if (videoEl) videoEl.srcObject = null;
      return;
    }

    const pMap = callObject.participants();
    const dailyParticipant = Object.values(pMap).find(
      (p) => p.session_id === sessionId
    );

    if (!dailyParticipant) return;

    const videoTrack = dailyParticipant.tracks.video;
    if (videoTrack.state === "playable" && videoTrack.persistentTrack) {
      // Only update srcObject if the track actually changed
      const existing = videoEl.srcObject instanceof MediaStream
        ? videoEl.srcObject.getVideoTracks()[0]
        : null;
      if (existing !== videoTrack.persistentTrack) {
        videoEl.srcObject = new MediaStream([videoTrack.persistentTrack]);
      }
    }

    return () => {
      videoEl.srcObject = null;
    };
  }, [callObject, joined, sessionId, hasVideo]);

  if (!hasVideo) return null;

  return (
    <div className={className}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={participant?.isLocal}
        className="h-full w-full rounded-lg object-cover"
      />
    </div>
  );
}
