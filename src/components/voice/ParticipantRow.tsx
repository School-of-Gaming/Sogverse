import { type Ref } from "react";
import { Mic, MicOff, Video, VideoOff, Crown, Lock, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { VOICE_CONFIG } from "@/lib/constants/voice";
import { cn } from "@/lib/utils";

export interface ParticipantRowData {
  userId: string;
  userName: string;
  audioOn: boolean;
  videoOn: boolean;
  isLocal: boolean;
  isOwner: boolean;
}

export interface ParticipantRowProps {
  participant: ParticipantRowData;
  volume: number;
  lockState: { audio: boolean; video: boolean };
  showModControls: boolean;
  avatarRef?: Ref<HTMLDivElement>;
  onVolumeChange?: (volume: number) => void;
  onMute?: (track: "audio" | "video") => void;
  onLock?: (track: "audio" | "video", locked: boolean) => void;
}

export function ParticipantRow({
  participant: p,
  volume,
  lockState,
  showModControls,
  avatarRef,
  onVolumeChange,
  onMute,
  onLock,
}: ParticipantRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-2 transition-colors",
        p.isLocal && "bg-accent/50",
      )}
    >
      {/* Avatar */}
      <div ref={avatarRef} className="shrink-0 rounded-md">
        <Avatar className="h-8 w-8">
          <Identicon id={p.userId} size={32} />
        </Avatar>
      </div>

      {/* Name + badges */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium">
          {p.userName}
          {p.isLocal && (
            <span className="ml-1 text-xs text-muted-foreground">(you)</span>
          )}
        </span>
        {p.isOwner && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Crown className="h-3 w-3" />
            Host
          </Badge>
        )}
      </div>

      {/* Volume slider (remote participants only) */}
      {!p.isLocal && (
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={VOICE_CONFIG.MIN_VOLUME * 100}
            max={VOICE_CONFIG.MAX_VOLUME * 100}
            value={Math.round(volume * 100)}
            onChange={(e) => onVolumeChange?.(Number(e.target.value) / 100)}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary"
            title={`Volume: ${Math.round(volume * 100)}%`}
          />
          <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}

      {/* Moderator controls */}
      {showModControls && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onMute?.("audio")}
            disabled={!p.audioOn}
            title="Mute microphone"
          >
            <MicOff className="h-3 w-3" />
            Mute
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onMute?.("video")}
            disabled={!p.videoOn}
            title="Disable camera"
          >
            <VideoOff className="h-3 w-3" />
            Cam off
          </Button>
          <Button
            variant={lockState.audio ? "destructive" : "ghost"}
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onLock?.("audio", !lockState.audio)}
            title={lockState.audio ? "Unlock microphone" : "Lock microphone"}
          >
            <Lock className="h-3 w-3" />
            {lockState.audio ? "Unlock mic" : "Lock mic"}
          </Button>
          <Button
            variant={lockState.video ? "destructive" : "ghost"}
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onLock?.("video", !lockState.video)}
            title={lockState.video ? "Unlock camera" : "Lock camera"}
          >
            <Lock className="h-3 w-3" />
            {lockState.video ? "Unlock cam" : "Lock cam"}
          </Button>
        </div>
      )}

      {/* Status indicators */}
      <div className="flex items-center gap-1.5">
        {p.videoOn && (
          <div className="relative">
            <Video className="h-3.5 w-3.5 text-muted-foreground" />
            {lockState.video && (
              <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-destructive" />
            )}
          </div>
        )}
        {!p.videoOn && lockState.video && (
          <div className="relative">
            <VideoOff className="h-3.5 w-3.5 text-destructive" />
            <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-destructive" />
          </div>
        )}
        <div className="relative">
          {p.audioOn ? (
            <Mic className="h-3.5 w-3.5 text-success" />
          ) : (
            <MicOff className="h-3.5 w-3.5 text-destructive" />
          )}
          {lockState.audio && (
            <Lock className="absolute -right-1 -top-1 h-2.5 w-2.5 text-destructive" />
          )}
        </div>
      </div>
    </div>
  );
}
