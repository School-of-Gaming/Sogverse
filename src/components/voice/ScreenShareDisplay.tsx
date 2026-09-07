"use client";

import { useEffect, useRef } from "react";
import { ScreenShareOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVoiceRoom } from "./VoiceRoomProvider";

interface ScreenShareDisplayProps {
  /** Keep rendering with this session ID during exit animation */
  sharerSessionIdOverride?: string | null;
}

export function ScreenShareDisplay({
  sharerSessionIdOverride,
}: ScreenShareDisplayProps) {
  const t = useTranslations('voice');
  const {
    callObject,
    joined,
    participants,
    screenSharerSessionId,
    isScreenSharing,
    stopScreenShare,
  } = useVoiceRoom();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Use the override (stale value) during exit animation so content doesn't vanish
  const effectiveSharerSessionId = screenSharerSessionId ?? sharerSessionIdOverride ?? null;

  const sharer = participants.find((p) => p.sessionId === effectiveSharerSessionId);

  // Attach the screen share video track to the <video> element
  useEffect(() => {
    if (!callObject || !joined || !effectiveSharerSessionId || !videoRef.current) return;

    const pMap = callObject.participants();
    const sharerParticipant = Object.values(pMap).find(
      (p) => p.session_id === effectiveSharerSessionId,
    );

    const screenTrack = sharerParticipant?.tracks.screenVideo;
    const videoEl = videoRef.current;
    if (screenTrack?.state === "playable" && screenTrack.persistentTrack) {
      videoEl.srcObject = new MediaStream([screenTrack.persistentTrack]);
    }

    return () => {
      videoEl.srcObject = null;
    };
  }, [callObject, joined, effectiveSharerSessionId, sharer?.screenShareOn]);

  if (!effectiveSharerSessionId || !sharer) return null;

  return (
    // The tile is a fixed 16:9 box and the share is drawn inside it at its own
    // aspect (`object-contain`), because a share cannot be cropped — a shared
    // window is whatever shape its owner's window is, and cutting a strip off it
    // can cut off the thing being pointed at. So the letterbox bars are real and
    // needed. What they are *not* is a colour of their own: they are the surface
    // the tile is sitting in, which is the card. Sogverse has no fourth neutral
    // below the ground, and true black is not one it is going to grow.
    <div className="relative overflow-hidden rounded-lg border border-border bg-card">
      <div className="aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="h-full w-full object-contain"
        />
      </div>

      {/* Sharer name badge. `outline` is the variant with no fill of its own,
          which is what the glass needs: a filled variant would keep its own
          `bg-*` beside the glass — tailwind-merge cannot see that the two are
          the same property — and the fill would win. */}
      <div className="absolute left-2 top-2">
        <Badge variant="outline" className="glass">
          {t('sharerScreen', { name: sharer.userName })}
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
            {t('stopSharing')}
          </Button>
        </div>
      )}
    </div>
  );
}
