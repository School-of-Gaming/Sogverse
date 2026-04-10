"use client";

import { Mic, MicOff, Video, VideoOff, ScreenShare, ScreenShareOff, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { MicLevelIndicator } from "./MicLevelIndicator";

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
  } = useVoiceRoom();
  const t = useTranslations("voice");

  return (
    <div className="flex items-center gap-2">
      {/* Mic toggle */}
      <div className="relative">
        <Button
          variant={micOn ? "secondary" : "destructive"}
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

      {/* Camera toggle */}
      {cameraAllowed && (
        <div className="relative">
          <Button
            variant={cameraOn ? "secondary" : "outline"}
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

      {/* Screen share toggle */}
      {canScreenShare && (
        <Button
          variant={isScreenSharing ? "destructive" : "outline"}
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

      {/* Mic input level meter */}
      {!joining && <MicLevelIndicator />}
    </div>
  );
}
