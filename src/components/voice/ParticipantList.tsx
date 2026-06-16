"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useVoiceRoom } from "./VoiceRoomProvider";
import { useSpeakingGlow } from "./hooks/use-speaking-glow";
import { ParticipantRow } from "./ParticipantRow";
import type { VoiceParticipant, LockState } from "./hooks/types";

export function ParticipantList() {
  const {
    participants,
    lockStates,
    muteParticipant,
    lockParticipant,
    isModerator,
  } = useVoiceRoom();

  const t = useTranslations('voice');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          {t('participantsCount', { count: participants.length })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {participants.map((p) => (
          <ParticipantRowWithGlow
            key={p.sessionId}
            participant={p}
            lockState={lockStates.get(p.sessionId) ?? { audio: false, video: false }}
            isLocalOwner={isModerator}
            onMute={(track) => muteParticipant(p.sessionId, track)}
            onLock={(track, locked) => lockParticipant(p.sessionId, track, locked)}
          />
        ))}

        {participants.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            {t('noParticipantsYet')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Wraps ParticipantRow with the speaking-glow hook (needs sessionId for audio analysis). */
function ParticipantRowWithGlow({
  participant,
  lockState,
  isLocalOwner,
  onMute,
  onLock,
}: {
  participant: VoiceParticipant;
  lockState: LockState;
  isLocalOwner: boolean;
  onMute: (track: "audio" | "video") => void;
  onLock: (track: "audio" | "video", locked: boolean) => void;
}) {
  const avatarRef = useRef<HTMLDivElement>(null);
  useSpeakingGlow(avatarRef, participant.sessionId, participant.audioOn);

  return (
    <ParticipantRow
      participant={participant}
      lockState={lockState}
      isModView={isLocalOwner}
      avatarRef={avatarRef}
      onMute={onMute}
      onLock={onLock}
    />
  );
}
