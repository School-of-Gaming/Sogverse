"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { GamerFlairDialog } from "@/components/member-flair";
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
  buildFlairFixture,
  buildRedesignParticipants,
  SEATED_MEMBER_IDS,
  VOICE_ROOM_REDESIGN_CUSTOM_ZONES,
  type VoiceRoomRedesignScenario,
} from "@/components/voice/mock-room-fixtures";
import type {
  ParticipantChatControls,
  ParticipantShareControls,
} from "@/components/voice/ParticipantRow";
import { VideoSurfaceProvider } from "@/components/voice/redesign/VideoSurface";
import { VoiceRoomRedesign } from "@/components/voice/redesign/VoiceRoomRedesign";
import {
  VoiceMemberFlairProvider,
  type VoiceMemberFlair,
} from "@/components/voice/VoiceMemberFlairProvider";
import { VoiceRoomContext } from "@/components/voice/VoiceRoomProvider";
import { composeZones } from "@/lib/voice/zone-composition";
import type { GamerCreation, VoiceZone } from "@/types";
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
const asyncNoop = async () => {};
const noAnalyser = () => null;
/** The list a member with no creations is handed: one identity, every render. */
const NO_CREATIONS: readonly GamerCreation[] = [];
/** The overlay's trainee tag stays empty, because this room marks no Gedu of any kind. */
const NO_TRAINEES: ReadonlySet<string> = new Set();

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
  gedu: {
    chatAccountId: CHAT_ACCOUNT_IDS.sanna,
    chatStanding: { kind: "moderator" },
    localRole: "gedu",
    isModerator: true,
    script: GROUP_SESSION_SCRIPT,
  },
};

/**
 * The redesigned room, as a draft body over a fixture context kept moving by a
 * simulated call: who speaks comes from `isSpeaking`, and video from the moving
 * canvases the scene hands the video surface. Moving between zones, sheets,
 * tabs, mic, camera, moderation and zones act on the simulation or local state,
 * and nothing reaches a backend.
 */
export function VoiceRoomRedesignScene({
  scenario,
}: {
  scenario: VoiceRoomRedesignScenario;
}) {
  const viewer = SCENARIO_VIEWERS[scenario];
  const [now] = useState(() => new Date());
  const [customZones, setCustomZones] = useState<VoiceZone[]>(VOICE_ROOM_REDESIGN_CUSTOM_ZONES);
  const zones = composeZones(customZones, GROUP_ID);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [fixture] = useState(() => buildFlairFixture(now));
  const [notes, setNotes] = useState(fixture.notes);
  const [creations, setCreations] = useState(fixture.creations);
  const [flairTarget, setFlairTarget] = useState<{ id: string; name: string } | null>(null);
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

  const flair: VoiceMemberFlair | null = viewer.isModerator
    ? {
        now,
        members: SEATED_MEMBER_IDS,
        newcomers: fixture.newcomers,
        notes,
        noteEditors: fixture.noteEditors,
        creations,
        trainees: NO_TRAINEES,
        onOpenFlair: (id, name) => setFlairTarget({ id, name }),
      }
    : null;

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

  const participantShareControls: ParticipantShareControls | undefined = viewer.isModerator
    ? (p) => ({
        sharing: p.screenShareOn,
        locked: room.shareLocks.has(p.sessionId),
        onStop: () => simulation.stopShare(p.sessionId),
        onSetLock: (locked) => simulation.lockShare(p.sessionId, locked),
      })
    : undefined;

  const { participants } = room;
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
    customZones,
    currentZoneId: local?.zoneId ?? "lobby",
    participantsByZone,
    moveSelfToZone: (zoneId) => simulation.moveSelf(zoneId),
    moveParticipantToZone: (sessionId, _userId, zoneId) =>
      simulation.moveParticipant(sessionId, zoneId),
    createZone: async ({ name, icon, color, isLocked }) => {
      const id = crypto.randomUUID();
      setCustomZones((rows) => [
        ...rows,
        { ...VOICE_ROOM_REDESIGN_CUSTOM_ZONES[0], id, name, icon, color, is_locked: isLocked, sort_order: rows.length },
      ]);
      simulation.zoneAdded(id, isLocked);
    },
    updateZone: async (id, patch) => {
      setCustomZones((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    },
    deleteZone: async (id) => {
      setCustomZones((rows) => rows.filter((row) => row.id !== id));
      simulation.zoneRemoved(id);
    },
    micOn: local?.audioOn ?? false,
    cameraOn: local?.videoOn ?? false,
    cameraAllowed: true,
    toggleMic: () => simulation.toggleMic(),
    toggleCamera: () => simulation.toggleCamera(),
    screenSharerSessionId: participants.find((p) => p.screenShareOn)?.sessionId ?? null,
    canScreenShare: viewer.isModerator || room.readerCanShare,
    isScreenSharing: local?.screenShareOn ?? false,
    startScreenShare: async () => {
      simulation.startShare(localSessionId ?? undefined);
    },
    stopScreenShare: () => {
      if (localSessionId !== null) simulation.stopShare(localSessionId);
    },
    isBroadcasting,
    toggleBroadcast: () => setIsBroadcasting((on) => !on),
    isDeafened,
    toggleDeafen: () => setIsDeafened((on) => !on),
    audioInputs: [],
    currentAudioInputId: null,
    setAudioInput: asyncNoop,
    mediaError: null,
    localLocks: { audio: false, video: false },
    lockStates: new Map(room.lockStates),
    muteParticipant: (sessionId, track) => simulation.muteParticipant(sessionId, track),
    lockParticipant: (sessionId, track, locked) =>
      simulation.lockParticipant(sessionId, track, locked),
    getAnalyser: noAnalyser,
    join: asyncNoop,
    leave: asyncNoop,
  };

  return (
    <VoiceRoomContext.Provider value={value}>
      <VideoSurfaceProvider value={renderVideo}>
        <VoiceMemberFlairProvider value={flair}>
          <VoiceRoomRedesign
            onLeave={asyncNoop}
            participantChatControls={participantChatControls}
            participantShareControls={participantShareControls}
            shareLocked={localSessionId !== null && room.shareLocks.has(localSessionId)}
            presenterSessionId={
              room.presenting ? (participants.find((p) => p.isOwner)?.sessionId ?? null) : null
            }
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
        </VoiceMemberFlairProvider>
      </VideoSurfaceProvider>
      <VoiceRoomSimPanel
        simulation={simulation}
        state={room}
        readerModerates={viewer.isModerator}
      />
      {flairTarget !== null && (
        <GamerFlairDialog
          open
          onOpenChange={(open) => {
            if (!open) setFlairTarget(null);
          }}
          name={flairTarget.name}
          note={notes[flairTarget.id] ?? ""}
          lastEditedBy={fixture.noteEditors[flairTarget.id] ?? null}
          creations={creations[flairTarget.id] ?? NO_CREATIONS}
          onSaveNote={(text) =>
            setNotes(({ [flairTarget.id]: _cleared, ...rest }) =>
              text.length > 0 ? { ...rest, [flairTarget.id]: text } : rest,
            )
          }
          onSaveCreations={(next) =>
            setCreations(({ [flairTarget.id]: _cleared, ...rest }) =>
              next.length > 0 ? { ...rest, [flairTarget.id]: next } : rest,
            )
          }
        />
      )}
    </VoiceRoomContext.Provider>
  );
}
