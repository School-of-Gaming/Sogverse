"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Headphones,
  HeadphoneOff,
  Loader2,
  Lock,
  Megaphone,
  Mic,
  MicOff,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Video,
  VideoOff,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LockedButton } from "@/components/ui/locked-control";
import { cn } from "@/lib/cn";
import { MicLevelIndicator } from "../MicLevelIndicator";
import { MicSettingsPopover } from "../MicSettingsPopover";
import { useVoiceModeratorLocks } from "../VoiceModeratorLocks";
import { useVoiceRoom } from "../VoiceRoomProvider";

/** An icon over its word, the shape of every control in the dock and the bar. */
const LABELLED =
  "h-16 flex-col gap-0.5 whitespace-normal px-0.5 text-xs leading-tight";

/**
 * Wraps rather than truncates, and every control is tall enough for two lines,
 * because the phone bar's narrowest cell is where "Camera off" has to stay whole.
 */
function LabelWord({ children }: { children: string }) {
  return (
    <span className="max-w-full text-center [overflow-wrap:anywhere]">{children}</span>
  );
}

/**
 * A labelled control: the word is on the button because a first-timer cannot be
 * expected to know the glyphs.
 */
export function LabelledButton({
  icon,
  label,
  moderatorLocked,
  cellClassName,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children"> & {
  icon: ReactNode;
  label: string;
  /** Draws the small padlock a moderator's lock wears. */
  moderatorLocked?: boolean;
  /** The cell's own width, which differs between the dock and the bar. */
  cellClassName?: string;
}) {
  return (
    <div className={cn("relative", cellClassName)}>
      <Button type="button" className={cn(LABELLED, "w-full", className)} {...props}>
        {icon}
        <LabelWord>{label}</LabelWord>
      </Button>
      {moderatorLocked && (
        <Lock className="absolute -right-1 -top-1 h-3 w-3 text-destructive" aria-hidden />
      )}
    </div>
  );
}

/**
 * The mic control and its colours, as `VoiceControls` documents them: on is the
 * act fill, and a muted mic is destructive for the weight of the next press,
 * since it makes the reader audible to everyone. The word states what is true
 * now, and the accessible name says what a press does.
 */
function MicControl() {
  const t = useTranslations("voice");
  const { micOn, toggleMic, joining, localLocks } = useVoiceRoom();
  const name = localLocks.audio
    ? t("micLockedByModerator")
    : micOn
      ? t("muteMicrophone")
      : t("unmuteMicrophone");
  return (
    <LabelledButton
      icon={micOn ? <Mic /> : <MicOff />}
      label={micOn ? t("stage.micOn") : t("stage.micOff")}
      variant={micOn ? "default" : "destructive"}
      onClick={toggleMic}
      disabled={joining || (localLocks.audio && !micOn)}
      moderatorLocked={localLocks.audio}
      title={name}
      aria-label={name}
    />
  );
}

/** The device chevron on the mic's corner, with its error badge. */
function MicSettings() {
  const { joining, audioInputs, currentAudioInputId, setAudioInput, mediaError } =
    useVoiceRoom();
  if (joining) return null;
  return (
    <MicSettingsPopover
      audioInputs={audioInputs}
      currentAudioInputId={currentAudioInputId}
      onSelectInput={setAudioInput}
      mediaError={mediaError}
      levelIndicator={<MicLevelIndicator />}
    />
  );
}

/**
 * The mic with its device chevron riding the corner, so it costs no width of a
 * cell's own. The chevron stays here in both layouts because its error badge is
 * how a reader whose mic has failed finds out.
 */
export function MicCell({ cellClassName }: { cellClassName?: string }) {
  return (
    <div className={cn("relative", cellClassName)}>
      <MicControl />
      <div className="absolute -right-0.5 -top-0.5">
        <MicSettings />
      </div>
    </div>
  );
}

/** Absent where the room allows no camera. */
export function CameraControl({ cellClassName }: { cellClassName?: string }) {
  const t = useTranslations("voice");
  const { cameraOn, cameraAllowed, toggleCamera, joining, localLocks } = useVoiceRoom();
  if (!cameraAllowed) return null;
  const name = localLocks.video
    ? t("cameraLockedByModerator")
    : cameraOn
      ? t("turnOffCamera")
      : t("turnOnCamera");
  return (
    <LabelledButton
      icon={cameraOn ? <Video /> : <VideoOff />}
      label={cameraOn ? t("stage.cameraOn") : t("stage.cameraOff")}
      variant={cameraOn ? "default" : "outline"}
      onClick={toggleCamera}
      disabled={joining || (localLocks.video && !cameraOn)}
      moderatorLocked={localLocks.video}
      title={name}
      aria-label={name}
      cellClassName={cellClassName}
    />
  );
}

/** Whether this viewer has any of the controls {@link ModeratorControls} draws. */
export function useHasModeratorControls(): boolean {
  const { canScreenShare, isModerator } = useVoiceRoom();
  const locks = useVoiceModeratorLocks();
  return canScreenShare || isModerator || locks !== null;
}

/**
 * Share, broadcast and deafen: working for a moderator, each locked and
 * explaining itself for a viewer the page handed locks, and nothing for anyone
 * else. Both layouts draw the same set.
 */
export function ModeratorControls({ cellClassName }: { cellClassName?: string }) {
  const t = useTranslations("voice");
  const {
    canScreenShare,
    isScreenSharing,
    startScreenShare,
    stopScreenShare,
    isModerator,
    isBroadcasting,
    toggleBroadcast,
    isDeafened,
    toggleDeafen,
    joining,
  } = useVoiceRoom();
  const locks = useVoiceModeratorLocks();

  if (!isModerator && locks !== null) {
    const locked: {
      explanation: typeof locks.screenShare;
      icon: ReactNode;
      label: string;
    }[] = [
      { explanation: locks.screenShare, icon: <ScreenShare />, label: t("stage.share") },
      { explanation: locks.broadcast, icon: <Megaphone />, label: t("broadcast") },
      { explanation: locks.deafen, icon: <Headphones />, label: t("deafen") },
    ];
    return locked.map(({ explanation, icon, label }) => (
      <div key={label} className={cn("relative", cellClassName)}>
        <LockedButton
          explanation={explanation}
          variant="outline"
          className={cn(LABELLED, "w-full gap-0.5")}
        >
          {icon}
          <LabelWord>{label}</LabelWord>
        </LockedButton>
      </div>
    ));
  }

  return (
    <>
      {canScreenShare && (
        <LabelledButton
          icon={isScreenSharing ? <ScreenShareOff /> : <ScreenShare />}
          label={isScreenSharing ? t("stopSharing") : t("stage.share")}
          variant={isScreenSharing ? "default" : "outline"}
          onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          disabled={joining}
          cellClassName={cellClassName}
        />
      )}
      {isModerator && (
        <>
          <LabelledButton
            icon={<Megaphone />}
            label={isBroadcasting ? t("stopBroadcast") : t("broadcast")}
            variant={isBroadcasting ? "default" : "outline"}
            onClick={toggleBroadcast}
            disabled={joining}
            cellClassName={cellClassName}
          />
          <LabelledButton
            icon={isDeafened ? <HeadphoneOff /> : <Headphones />}
            label={isDeafened ? t("undeafen") : t("deafen")}
            variant={isDeafened ? "default" : "outline"}
            onClick={toggleDeafen}
            disabled={joining}
            cellClassName={cellClassName}
          />
        </>
      )}
    </>
  );
}

export function LeaveControl({
  leaving,
  onLeave,
  label,
  cellClassName,
}: {
  leaving: boolean;
  onLeave: () => void;
  label?: string;
  cellClassName?: string;
}) {
  const t = useTranslations("voice");
  const { joining } = useVoiceRoom();
  return (
    <LabelledButton
      icon={leaving ? <Loader2 className="animate-spin" /> : <PhoneOff />}
      label={label ?? t("leave")}
      variant="destructive"
      onClick={onLeave}
      disabled={joining || leaving}
      cellClassName={cellClassName}
    />
  );
}
