"use client";

import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { MicLevelIndicator } from "./MicLevelIndicator";

export function VoiceControls() {
  const { micOn, cameraOn, cameraAllowed, toggleMic, toggleCamera, joining } =
    useVoiceRoom();

  return (
    <div className="flex flex-col gap-2">
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

        {/* Camera toggle */}
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
      </div>

      {/* Mic input level meter */}
      {!joining && <MicLevelIndicator />}
    </div>
  );
}
