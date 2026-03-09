"use client";

import { useEffect, useRef } from "react";
import { ScreenShareOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVoiceRoom } from "./VoiceRoomProvider";

export function ScreenShareDisplay() {
  const {
    callObject,
    participants,
    screenSharerSessionId,
    isScreenSharing,
    stopScreenShare,
  } = useVoiceRoom();
  const videoRef = useRef<HTMLVideoElement>(null);

  const sharer = participants.find((p) => p.sessionId === screenSharerSessionId);

  // Attach the screen share video track to the <video> element
  useEffect(() => {
    if (!callObject || !screenSharerSessionId || !videoRef.current) return;

    const pMap = callObject.participants();
    const sharerParticipant = Object.values(pMap).find(
      (p) => p.session_id === screenSharerSessionId,
    );

    const screenTrack = sharerParticipant?.tracks.screenVideo;
    const videoEl = videoRef.current;
    if (screenTrack?.state === "playable" && screenTrack.persistentTrack) {
      videoEl.srcObject = new MediaStream([screenTrack.persistentTrack]);
    }

    return () => {
      videoEl.srcObject = null;
    };
  }, [callObject, screenSharerSessionId, participants]);

  if (!screenSharerSessionId || !sharer) return null;

  return (
    <div className="relative overflow-hidden rounded-lg border bg-black">
      <div className="aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-contain"
        />
      </div>

      {/* Sharer name badge */}
      <div className="absolute left-2 top-2">
        <Badge variant="secondary" className="bg-background/80 backdrop-blur-sm">
          {sharer.userName}&apos;s screen
        </Badge>
      </div>

      {/* Stop sharing button (only for the local sharer) */}
      {isScreenSharing && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <Button
            variant="destructive"
            size="sm"
            onClick={stopScreenShare}
            className="gap-1.5"
          >
            <ScreenShareOff className="h-4 w-4" />
            Stop sharing
          </Button>
        </div>
      )}
    </div>
  );
}
