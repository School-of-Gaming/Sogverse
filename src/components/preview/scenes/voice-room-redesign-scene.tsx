"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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
import { VideoSurfaceProvider } from "@/components/voice/redesign/VideoSurface";
import { VoiceRoomRedesign } from "@/components/voice/redesign/VoiceRoomRedesign";
import { VoiceRoomContext } from "@/components/voice/VoiceRoomProvider";
import { composeZones } from "@/lib/voice/zone-composition";
import { useChatSceneStore } from "./chat-scene-store";
import {
  buildBench,
  GROUP_SESSION_SCRIPT,
  withLiveCameras,
} from "./voice-room-sim-fixtures";
import { VoiceRoomSimPanel } from "./voice-room-sim-panel";
import { useFakeVideo } from "./voice-room-sim-video";
import { RoomSimulation, type SimulationScript } from "./voice-room-simulation";

const GROUP_ID = "preview-group";
const noop = () => {};
const asyncNoop = async () => {};
const noAnalyser = () => null;

/**
 * Who each scenario is and what happens in their room. One line per viewer,
 * which is what keeps a further scenario to a fixture entry and a script rather
 * than a branch through the scene.
 */
const SCENARIO_VIEWERS: Record<
  VoiceRoomRedesignScenario,
  {
    chatAccountId: string;
    chatStanding: ChatStanding;
    localRole: VoiceRoomContextValue["localRole"];
    isModerator: boolean;
    script: SimulationScript;
  }
> = {
  gamer: {
    chatAccountId: CHAT_ACCOUNT_IDS.aino,
    chatStanding: { kind: "participant" },
    localRole: "gamer",
    isModerator: false,
    script: GROUP_SESSION_SCRIPT,
  },
};

/**
 * The redesigned room, as a draft body over a fixture context kept moving by a
 * simulated call: who speaks comes from `isSpeaking`, and video from the moving
 * canvases the scene hands the video surface. Moving between zones, sheets,
 * tabs, mic and camera act on the simulation; everything that would reach a
 * backend is inert.
 */
export function VoiceRoomRedesignScene({
  scenario,
}: {
  scenario: VoiceRoomRedesignScenario;
}) {
  const viewer = SCENARIO_VIEWERS[scenario];
  const [now] = useState(() => new Date());
  const [zones] = useState(() => composeZones(VOICE_ROOM_REDESIGN_CUSTOM_ZONES, GROUP_ID));
  const [simulation] = useState(
    () =>
      new RoomSimulation({
        participants: withLiveCameras(buildRedesignParticipants(scenario)),
        bench: buildBench(),
        openZoneIds: zones.filter((zone) => !zone.isLocked).map((zone) => zone.id),
        script: viewer.script,
      }),
  );
  const room = useSyncExternalStore(
    simulation.subscribe,
    simulation.getSnapshot,
    simulation.getSnapshot,
  );
  useEffect(() => {
    simulation.mount();
    return () => simulation.unmount();
  }, [simulation]);
  const renderVideo = useFakeVideo();

  const chat = useChatSceneStore(now, viewer.chatAccountId);
  const { typingBurst } = chat;
  useEffect(() => simulation.onChatBurst(typingBurst), [simulation, typingBurst]);
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

  const { participants, sharerSessionId } = room;
  const participantsByZone = new Map(
    zones.map((zone) => [zone.id, participants.filter((p) => p.zoneId === zone.id)]),
  );
  const local = participants.find((p) => p.isLocal);
  const localSessionId = local?.sessionId ?? null;

  const value: VoiceRoomContextValue = {
    joined: true,
    joining: false,
    callObject: null,
    localSessionId,
    localRole: viewer.localRole,
    isModerator: viewer.isModerator,
    groupId: GROUP_ID,
    participants,
    zones,
    customZones: VOICE_ROOM_REDESIGN_CUSTOM_ZONES,
    currentZoneId: local?.zoneId ?? "lobby",
    participantsByZone,
    moveSelfToZone: (zoneId) => simulation.moveSelf(zoneId),
    moveParticipantToZone: (sessionId, _userId, zoneId) =>
      simulation.moveParticipant(sessionId, zoneId),
    createZone: asyncNoop,
    updateZone: asyncNoop,
    deleteZone: asyncNoop,
    micOn: local?.audioOn ?? false,
    cameraOn: local?.videoOn ?? false,
    cameraAllowed: true,
    toggleMic: () => simulation.toggleMic(),
    toggleCamera: () => simulation.toggleCamera(),
    screenSharerSessionId: sharerSessionId,
    canScreenShare: viewer.isModerator,
    isScreenSharing: sharerSessionId !== null && sharerSessionId === localSessionId,
    startScreenShare: async () => simulation.startShare(localSessionId ?? undefined),
    stopScreenShare: () => simulation.stopShare(),
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
      <VideoSurfaceProvider value={renderVideo}>
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
      <VoiceRoomSimPanel simulation={simulation} state={room} />
    </VoiceRoomContext.Provider>
  );
}
