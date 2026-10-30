"use client";

import { useState } from "react";
import { Video } from "lucide-react";
import {
  ChatView,
  deriveChatLockControl,
  type ChatStanding,
} from "@/components/chat";
import {
  CHAT_ACCOUNT_IDS,
  CHAT_SCENE_ACCOUNTS,
  chatSceneAccountsSeenBy,
} from "@/components/chat/mock-chat-fixtures";
import { FIXTURE_TIMEZONE } from "@/components/family/mock-enrollment-fixtures";
import type { VoiceRoomContextValue } from "@/components/voice/hooks/types";
import {
  buildRedesignParticipants,
  VOICE_ROOM_REDESIGN_CUSTOM_ZONES,
  type VoiceRoomRedesignScenario,
} from "@/components/voice/mock-room-fixtures";
import type { ParticipantChatControls } from "@/components/voice/ParticipantRow";
import {
  VideoSurfaceProvider,
  type RenderVideo,
} from "@/components/voice/redesign/VideoSurface";
import { VoiceRoomRedesign } from "@/components/voice/redesign/VoiceRoomRedesign";
import { VoiceRoomContext } from "@/components/voice/VoiceRoomProvider";
import { composeZones } from "@/lib/voice/zone-composition";
import { useChatSceneStore } from "./chat-scene-store";

const GROUP_ID = "preview-group";
const noop = () => {};
const asyncNoop = async () => {};
const noAnalyser = () => null;

/**
 * Who each scenario is. One line per viewer, which is what keeps a further
 * scenario to a fixture entry rather than a branch through the scene.
 */
const SCENARIO_VIEWERS: Record<
  VoiceRoomRedesignScenario,
  {
    chatAccountId: string;
    chatStanding: ChatStanding;
    localRole: VoiceRoomContextValue["localRole"];
    isModerator: boolean;
  }
> = {
  gamer: {
    chatAccountId: CHAT_ACCOUNT_IDS.aino,
    chatStanding: { kind: "participant" },
    localRole: "gamer",
    isModerator: false,
  },
};

/** There is no call to attach to, so a live camera or share is a plain stand-in. */
const renderPlaceholderVideo: RenderVideo = () => (
  <div className="flex h-full w-full items-center justify-center bg-lifted">
    <Video className="h-8 w-8 text-muted-foreground" aria-hidden />
  </div>
);

/**
 * The redesigned room, as a draft body over a fixture context, driven entirely
 * by context values: who speaks comes from `isSpeaking`, and video from whatever
 * the scene hands the video surface. Moving between zones, sheets, tabs, mic and
 * camera work against local state; everything that would reach a backend is inert.
 */
export function VoiceRoomRedesignScene({
  scenario,
}: {
  scenario: VoiceRoomRedesignScenario;
}) {
  const viewer = SCENARIO_VIEWERS[scenario];
  const [now] = useState(() => new Date());
  const [fixtureParticipants] = useState(() => buildRedesignParticipants(scenario));
  const [currentZoneId, setCurrentZoneId] = useState(
    () => fixtureParticipants.find((p) => p.isLocal)?.zoneId ?? "lobby",
  );
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(false);

  const chat = useChatSceneStore(now, viewer.chatAccountId);
  const chatViewer =
    CHAT_SCENE_ACCOUNTS.find((account) => account.id === chat.viewerId) ??
    CHAT_SCENE_ACCOUNTS[0];

  const participantChatControls: ParticipantChatControls = (userId) => {
    const direction = deriveChatLockControl(
      chatViewer,
      viewer.chatStanding,
      CHAT_SCENE_ACCOUNTS.find((account) => account.id === userId) ?? null,
      chat.lockedIds.has(userId),
    );
    if (direction === null) return null;
    return { direction, onSetLock: (locked) => chat.setLock(userId, locked) };
  };

  const participants = fixtureParticipants.map((p) =>
    p.isLocal
      ? { ...p, zoneId: currentZoneId, audioOn: micOn, videoOn: cameraOn }
      : p,
  );
  const zones = composeZones(VOICE_ROOM_REDESIGN_CUSTOM_ZONES, GROUP_ID);
  const participantsByZone = new Map(
    zones.map((zone) => [zone.id, participants.filter((p) => p.zoneId === zone.id)]),
  );
  const local = participants.find((p) => p.isLocal);

  const value: VoiceRoomContextValue = {
    joined: true,
    joining: false,
    callObject: null,
    localSessionId: local?.sessionId ?? null,
    localRole: viewer.localRole,
    isModerator: viewer.isModerator,
    groupId: GROUP_ID,
    participants,
    zones,
    customZones: VOICE_ROOM_REDESIGN_CUSTOM_ZONES,
    currentZoneId,
    participantsByZone,
    moveSelfToZone: (zoneId) => {
      const zone = zones.find((z) => z.id === zoneId);
      if (zone && (!zone.isLocked || viewer.isModerator)) setCurrentZoneId(zoneId);
    },
    moveParticipantToZone: noop,
    createZone: asyncNoop,
    updateZone: asyncNoop,
    deleteZone: asyncNoop,
    micOn,
    cameraOn,
    cameraAllowed: true,
    toggleMic: () => setMicOn((on) => !on),
    toggleCamera: () => setCameraOn((on) => !on),
    screenSharerSessionId: null,
    canScreenShare: viewer.isModerator,
    isScreenSharing: false,
    startScreenShare: asyncNoop,
    stopScreenShare: noop,
    isBroadcasting: false,
    toggleBroadcast: noop,
    isDeafened: false,
    toggleDeafen: noop,
    audioInputs: [],
    currentAudioInputId: null,
    setAudioInput: asyncNoop,
    mediaError: null,
    localLocks: { audio: false, video: false },
    lockStates: new Map(),
    muteParticipant: noop,
    lockParticipant: noop,
    getAnalyser: noAnalyser,
    join: asyncNoop,
    leave: asyncNoop,
  };

  return (
    <VoiceRoomContext.Provider value={value}>
      <VideoSurfaceProvider value={renderPlaceholderVideo}>
        <VoiceRoomRedesign
          onLeave={asyncNoop}
          participantChatControls={participantChatControls}
          chat={(heightClassName) => (
            <ChatView
              messages={chat.messages}
              accounts={chatSceneAccountsSeenBy(chatViewer)}
              viewer={chatViewer}
              standing={viewer.chatStanding}
              lockedAccountIds={chat.lockedIds}
              typingAccountIds={chat.typingIds}
              heightClassName={heightClassName}
              timeZone={FIXTURE_TIMEZONE}
              handlers={{
                onSend: chat.send,
                onToggleReaction: chat.toggleReaction,
                onEdit: chat.edit,
                onDelete: chat.remove,
                onHide: chat.remove,
                onRestore: chat.restore,
                onSetLock: chat.setLock,
                onRetry: chat.retry,
              }}
            />
          )}
        />
      </VideoSurfaceProvider>
    </VoiceRoomContext.Provider>
  );
}
