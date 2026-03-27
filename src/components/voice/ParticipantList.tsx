"use client";

import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { useSpeakingGlow } from "./hooks/use-speaking-glow";
import { ParticipantRow } from "./ParticipantRow";
import type { VoiceParticipant, LockState } from "./hooks/types";

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
          <ParticipantRowWithGlow
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

/** Wraps ParticipantRow with the speaking-glow hook (needs sessionId for audio analysis). */
function ParticipantRowWithGlow({
  participant,
  volume,
  lockState,
  isLocalOwner,
  onVolumeChange,
  onMute,
  onLock,
}: {
  participant: VoiceParticipant;
  volume: number;
  lockState: LockState;
  isLocalOwner: boolean;
  onVolumeChange: (volume: number) => void;
  onMute: (track: "audio" | "video") => void;
  onLock: (track: "audio" | "video", locked: boolean) => void;
}) {
  const avatarRef = useRef<HTMLDivElement>(null);
  useSpeakingGlow(avatarRef, participant.analyserRef, participant.audioOn);

  return (
    <ParticipantRow
      participant={participant}
      volume={volume}
      lockState={lockState}
      isModView={isLocalOwner}
      avatarRef={avatarRef}
      onVolumeChange={onVolumeChange}
      onMute={onMute}
      onLock={onLock}
    />
  );
}
