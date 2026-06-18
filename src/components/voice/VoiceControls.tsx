"use client";

import { ScreenShare, ScreenShareOff, Megaphone, Headphones, HeadphoneOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { MicSettingsPopover } from "./MicSettingsPopover";
import { MicLevelIndicator } from "./MicLevelIndicator";
import { MicToggleButton, CameraToggleButton } from "./MediaToggleButtons";

export function VoiceControls() {
  const {
    micOn,
    cameraOn,
    cameraAllowed,
    toggleMic,
    toggleCamera,
    joining,
    localLocks,
    audioInputs,
    currentAudioInputId,
    setAudioInput,
    mediaError,
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
    // Color scheme for the toggles: engaged → `default` (primary fill = "this
    // is live/on"), idle → `outline`. One deliberate exception — a *muted* mic
    // is `destructive` (red). It's not flagging a dangerous state but the weight
    // of the next click: un-muting makes the user audible to everyone in the
    // room. That's a big, easy-to-forget change, so the muted mic stays loud
    // until it's back on. Camera-off is a quieter change and keeps the plain
    // outline. `destructive` is otherwise the Leave button's color.
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      {/* Group 1 — personal media controls */}
      <div className="flex items-center gap-2">
        <MicToggleButton
          on={micOn}
          onToggle={toggleMic}
          disabled={joining}
          locked={localLocks.audio}
        />

        {/* Mic device picker + level + troubleshooting */}
        {!joining && (
          <MicSettingsPopover
            audioInputs={audioInputs}
            currentAudioInputId={currentAudioInputId}
            onSelectInput={setAudioInput}
            mediaError={mediaError}
            levelIndicator={<MicLevelIndicator />}
          />
        )}

        {cameraAllowed && (
          <CameraToggleButton
            on={cameraOn}
            onToggle={toggleCamera}
            disabled={joining}
            locked={localLocks.video}
          />
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
