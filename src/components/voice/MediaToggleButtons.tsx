"use client";

import { Mic, MicOff, Video, VideoOff, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface MediaToggleProps {
  /** Whether the track is currently on (mic unmuted / camera live). */
  on: boolean;
  onToggle: () => void;
  /** Extra disable condition — `joining` in-call, or "no stream yet" in the lobby. */
  disabled?: boolean;
  /**
   * Moderator lock (in-call only; the lobby never passes this). When set, the
   * control can't be turned back on and shows a small lock badge. The lobby has
   * no moderators, so it omits this and the badge never renders there.
   */
  locked?: boolean;
}

/**
 * The mic / camera toggle buttons used by *both* the in-call control dock
 * (`VoiceControls`) and the instant-room pre-join lobby (`InstantVoiceLobby`),
 * so the two surfaces share one visual grammar. Presentational only: state and
 * the toggle action are passed in, which is what lets the lobby drive them off a
 * raw `getUserMedia` stream while the dock drives them off the Daily call object.
 *
 * Color grammar (matches the rest of the control dock): on → `default` (act
 * fill = "live"), off → `outline`, with the one deliberate exception that a
 * *muted mic* is `destructive` (red) — not a danger flag but the weight of the
 * next click, since un-muting makes the user audible to everyone.
 */
export function MicToggleButton({ on, onToggle, disabled, locked }: MediaToggleProps) {
  const t = useTranslations("voice");
  const label = locked
    ? t("micLockedByModerator")
    : on
      ? t("muteMicrophone")
      : t("unmuteMicrophone");
  return (
    <div className="relative">
      <Button
        type="button"
        variant={on ? "default" : "destructive"}
        size="icon"
        onClick={onToggle}
        disabled={disabled || (locked && !on)}
        title={label}
        aria-label={label}
      >
        {on ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </Button>
      {locked && <Lock className="absolute -right-1 -top-1 h-3 w-3 text-destructive" />}
    </div>
  );
}

export function CameraToggleButton({ on, onToggle, disabled, locked }: MediaToggleProps) {
  const t = useTranslations("voice");
  const label = locked
    ? t("cameraLockedByModerator")
    : on
      ? t("turnOffCamera")
      : t("turnOnCamera");
  return (
    <div className="relative">
      <Button
        type="button"
        variant={on ? "default" : "outline"}
        size="icon"
        onClick={onToggle}
        disabled={disabled || (locked && !on)}
        title={label}
        aria-label={label}
      >
        {on ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      </Button>
      {locked && <Lock className="absolute -right-1 -top-1 h-3 w-3 text-destructive" />}
    </div>
  );
}
