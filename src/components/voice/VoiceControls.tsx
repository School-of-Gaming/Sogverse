"use client";

import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { cn } from "@/lib/utils";

export function VoiceControls() {
  const { micOn, cameraOn, cameraAllowed, toggleMic, toggleCamera, leave, joining } =
    useVoiceRoom();

  return (
    <div className="flex items-center gap-2">
      {/* Mic toggle */}
      <Button
        variant={micOn ? "secondary" : "destructive"}
        size="icon"
        onClick={toggleMic}
        disabled={joining}
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
          disabled={joining}
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
        onClick={leave}
        disabled={joining}
        className={cn("gap-1.5")}
      >
        <PhoneOff className="h-4 w-4" />
        Leave
      </Button>
    </div>
  );
}
