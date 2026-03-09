"use client";

import { Mic, MicOff, Video, VideoOff, Crown, Lock, Volume2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { useVoiceRoom, type VoiceParticipant, type LockState } from "./VoiceRoomProvider";
import { cn } from "@/lib/utils";

export function ParticipantList() {
  const {
    participants,
    volumeMultipliers,
    setParticipantVolume,
    lockStates,
    muteParticipant,
    lockParticipant,
    localRole,
  } = useVoiceRoom();

  const isLocalOwner = localRole === "admin" || localRole === "gedu";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Participants ({participants.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {participants.map((p) => (
          <ParticipantRow
            key={p.sessionId}
            participant={p}
            volume={volumeMultipliers.get(p.sessionId) ?? 1.0}
            lockState={lockStates.get(p.sessionId) ?? { audio: false, video: false }}
            isLocalOwner={isLocalOwner}
            onVolumeChange={(vol) => setParticipantVolume(p.sessionId, vol)}
            onMute={(track) => muteParticipant(p.sessionId, track)}
            onLock={(track, locked) => lockParticipant(p.sessionId, track, locked)}
          />
        ))}

        {participants.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No participants yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface ParticipantRowProps {
  participant: VoiceParticipant;
  volume: number;
  lockState: LockState;
  isLocalOwner: boolean;
  onVolumeChange: (volume: number) => void;
  onMute: (track: "audio" | "video") => void;
  onLock: (track: "audio" | "video", locked: boolean) => void;
}

function ParticipantRow({
  participant: p,
  volume,
  lockState,
  isLocalOwner,
  onVolumeChange,
  onMute,
  onLock,
}: ParticipantRowProps) {
  // Show moderator controls for non-local, non-owner participants
  const showModControls = isLocalOwner && !p.isLocal && !p.isOwner;

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border p-2 transition-colors transition-shadow",
          p.isLocal && "bg-accent/50",
          p.isSpeaking && p.audioOn && "ring-2 ring-success",
        )}
      >
        {/* Avatar */}
        <Avatar className="h-8 w-8">
          <Identicon id={p.userId} size={32} />
        </Avatar>

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

      {/* Volume slider (remote participants only) */}
      {!p.isLocal && (
        <div className="flex items-center gap-2 px-2">
          <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={10}
            max={200}
            value={Math.round(volume * 100)}
            onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
            className="h-1.5 w-full cursor-pointer accent-primary"
            title={`Volume: ${Math.round(volume * 100)}%`}
          />
          <span className="w-10 text-right text-xs text-muted-foreground">
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}

      {/* Moderator controls */}
      {showModControls && (
        <div className="flex items-center gap-1 px-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onMute("audio")}
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
            onClick={() => onMute("video")}
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
            onClick={() => onLock("audio", !lockState.audio)}
            title={lockState.audio ? "Unlock microphone" : "Lock microphone"}
          >
            <Lock className="h-3 w-3" />
            {lockState.audio ? "Unlock mic" : "Lock mic"}
          </Button>
          <Button
            variant={lockState.video ? "destructive" : "ghost"}
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs"
            onClick={() => onLock("video", !lockState.video)}
            title={lockState.video ? "Unlock camera" : "Lock camera"}
          >
            <Lock className="h-3 w-3" />
            {lockState.video ? "Unlock cam" : "Lock cam"}
          </Button>
        </div>
      )}
    </div>
  );
}
