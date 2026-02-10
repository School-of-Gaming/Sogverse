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
  const { callObject, participants } = useVoiceRoom();
  const videoRef = useRef<HTMLVideoElement>(null);

  const participant = participants.find((p) => p.sessionId === sessionId);
  const hasVideo = participant?.videoOn ?? false;

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!callObject || !videoEl || !hasVideo) return;

    const pMap = callObject.participants();
    // Find the matching participant by session_id
    const dailyParticipant = Object.values(pMap).find(
      (p) => p.session_id === sessionId
    );

    if (!dailyParticipant) return;

    const videoTrack = dailyParticipant.tracks.video;
    if (
      videoTrack?.state === "playable" &&
      videoTrack.persistentTrack
    ) {
      const stream = new MediaStream([videoTrack.persistentTrack]);
      videoEl.srcObject = stream;
    }

    return () => {
      videoEl.srcObject = null;
    };
  }, [callObject, sessionId, hasVideo, participants]);

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
