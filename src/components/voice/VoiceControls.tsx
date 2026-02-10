"use client";

import { useState } from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";

interface VoiceControlsProps {
  /** Called after leaving the call (e.g. to close the room for gedu) */
  onLeave?: () => Promise<void>;
  /** Label for the leave button */
  leaveLabel?: string;
}

export function VoiceControls({ onLeave, leaveLabel = "Leave" }: VoiceControlsProps) {
  const { micOn, cameraOn, cameraAllowed, toggleMic, toggleCamera, leave, joining } =
    useVoiceRoom();
  const [leaving, setLeaving] = useState(false);

  const handleLeave = async () => {
    setLeaving(true);
    try {
      await leave();
      await onLeave?.();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Mic toggle */}
      <Button
        variant={micOn ? "secondary" : "destructive"}
        size="icon"
        onClick={toggleMic}
        disabled={joining || leaving}
        title={micOn ? "Mute microphone" : "Unmute microphone"}
      >
        {micOn ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </Button>

      {/* Camera toggle — only shown if allowed (gedu/admin) */}
      {cameraAllowed && (
        <Button
          variant={cameraOn ? "secondary" : "outline"}
          size="icon"
          onClick={toggleCamera}
          disabled={joining || leaving}
          title={cameraOn ? "Turn off camera" : "Turn on camera"}
        >
          {cameraOn ? (
            <Video className="h-4 w-4" />
          ) : (
            <VideoOff className="h-4 w-4" />
          )}
        </Button>
      )}

      {/* Leave */}
      <Button
        variant="destructive"
        size="sm"
        onClick={handleLeave}
        disabled={joining || leaving}
        className="gap-1.5"
      >
        {leaving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <PhoneOff className="h-4 w-4" />
        )}
        {leaveLabel}
      </Button>
    </div>
  );
}
