"use client";

import { Mic, MicOff, Video, VideoOff, ScreenShare, ScreenShareOff, Lock, Megaphone, Headphones, HeadphoneOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { MicSettingsPopover } from "./MicSettingsPopover";

export function VoiceControls() {
  const {
    micOn,
    cameraOn,
    cameraAllowed,
    toggleMic,
    toggleCamera,
    joining,
    localLocks,
    canScreenShare,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    isModerator,
    isBroadcasting,
    toggleBroadcast,
    isDeafened,
    toggleDeafen,
  } = useVoiceRoom();
  const t = useTranslations("voice");

  return (
    // Two groups of controls: personal media (mic, camera) and screen-share +
    // moderator controls (broadcast, deafen). On wider screens they sit on one
    // row (`sm:flex-row`); on narrow screens they stack into two rows — we only
    // drop to a second row when we need the space.
    //
    // Semantic color rule (see feedback): `destructive` is reserved for the
    // Leave button. Every control here is a toggle, so it follows one consistent
    // scheme — engaged → `default` (primary fill = "this is live/on"), idle →
    // `outline`. A muted mic / off camera is a state, not a destructive action,
    // so it never uses the destructive color.
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {/* Group 1 — personal media controls */}
      <div className="flex items-center gap-2">
        {/* Mic toggle */}
        <div className="relative">
          <Button
            variant={micOn ? "default" : "outline"}
            size="icon"
            onClick={toggleMic}
            disabled={joining || (localLocks.audio && !micOn)}
            title={
              localLocks.audio
                ? t("micLockedByModerator")
                : micOn
                  ? t("muteMicrophone")
                  : t("unmuteMicrophone")
            }
          >
            {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>
          {localLocks.audio && (
            <Lock className="absolute -right-1 -top-1 h-3 w-3 text-destructive" />
          )}
        </div>

        {/* Mic device picker + level + troubleshooting */}
        {!joining && <MicSettingsPopover />}

        {/* Camera toggle */}
        {cameraAllowed && (
          <div className="relative">
            <Button
              variant={cameraOn ? "default" : "outline"}
              size="icon"
              onClick={toggleCamera}
              disabled={joining || (localLocks.video && !cameraOn)}
              title={
                localLocks.video
                  ? t("cameraLockedByModerator")
                  : cameraOn
                    ? t("turnOffCamera")
                    : t("turnOnCamera")
              }
            >
              {cameraOn ? (
                <Video className="h-4 w-4" />
              ) : (
                <VideoOff className="h-4 w-4" />
              )}
            </Button>
            {localLocks.video && (
              <Lock className="absolute -right-1 -top-1 h-3 w-3 text-destructive" />
            )}
          </div>
        )}

      </div>

      {/* Group 2 — screen share + moderator broadcast/deafen */}
      {(canScreenShare || isModerator) && (
        <div className="flex items-center gap-2">
          {/* Screen share toggle */}
          {canScreenShare && (
            <Button
              variant={isScreenSharing ? "default" : "outline"}
              size="icon"
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              disabled={joining}
              title={isScreenSharing ? t("stopScreenShare") : t("shareScreen")}
            >
              {isScreenSharing ? (
                <ScreenShareOff className="h-4 w-4" />
              ) : (
                <ScreenShare className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Broadcast + deafen (moderators only) */}
          {isModerator && (
            <>
              <Button
                variant={isBroadcasting ? "default" : "outline"}
                size="icon"
                onClick={toggleBroadcast}
                disabled={joining}
                title={isBroadcasting ? t("stopBroadcast") : t("broadcast")}
              >
                <Megaphone className="h-4 w-4" />
              </Button>
              <Button
                variant={isDeafened ? "default" : "outline"}
                size="icon"
                onClick={toggleDeafen}
                disabled={joining}
                title={isDeafened ? t("undeafen") : t("deafen")}
              >
                {isDeafened ? <HeadphoneOff className="h-4 w-4" /> : <Headphones className="h-4 w-4" />}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
