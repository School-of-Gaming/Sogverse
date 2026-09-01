"use client";

import { useState } from "react";
import { GamerNoteDialog } from "@/components/member-flair";
import { ChatView, deriveChatLockControl } from "@/components/chat";
import {
  CHAT_ACCOUNT_IDS,
  CHAT_SCENE_ACCOUNTS,
} from "@/components/chat/mock-chat-fixtures";
import { FIXTURE_TIMEZONE } from "@/components/family/mock-enrollment-fixtures";
import { VoiceRoom } from "@/components/voice/VoiceRoom";
import { VoiceRoomContext } from "@/components/voice/VoiceRoomProvider";
import { VoiceMemberFlairProvider } from "@/components/voice/VoiceMemberFlairProvider";
import type { ParticipantChatControls } from "@/components/voice/ParticipantRow";
import {
  buildFlairFixture,
  buildParticipants,
  SEATED_MEMBER_IDS,
  VOICE_ROOM_CUSTOM_ZONES,
  type VoiceRoomScenario,
} from "@/components/voice/mock-room-fixtures";
import type {
  VoiceParticipant,
  VoiceRoomContextValue,
} from "@/components/voice/hooks/types";
import { composeZones } from "@/lib/voice/zone-composition";
import { useChatSceneStore } from "./chat-scene-store";

/**
 * The scheduled group voice room, over fixtures, as staff and as a child.
 *
 * It exists for one reason: the participant rail is where a Gedu meets the
 * member flair mid-session, and a rail is judged by the rows above and below a
 * row — never by one row on a card. The room around it is real (the zone
 * cards, the control dock, the chat panel), because the rail's width, its
 * position beside the zones and the dock overlapping its foot are all part of
 * what makes a mark legible or invisible there.
 *
 * **Sanna, the Gedu running the session, is in the room but not in the group**
 * — she has no note button on her own row, and neither would a second Gedu or a
 * visiting admin. That is what the fixture's seat list is for: a room is not a
 * roster, and a note is about a seat.
 *
 * **Every voice component is a pure consumer of `VoiceRoomContext`**, so a
 * fixture context drives them exactly as the live provider does — no Daily
 * call, no token, no network. Actions are inert; what works is what is pure
 * UI, plus the note dialog against local state.
 */
export function VoiceRoomScene({ scenario }: { scenario: VoiceRoomScenario }) {
  const isStaff = scenario === "gedu";

  // One instant for the room, frozen at mount, exactly as the live page hands
  // its rows one request-stable clock. A ticking one would walk the badges
  // forward under whoever is reading them.
  const [now] = useState(() => new Date());
  const [participants] = useState(() => buildParticipants(scenario));
  const [fixture] = useState(() => buildFlairFixture(now));
  const [notes, setNotes] = useState<Record<string, string>>(fixture.notes);
  const [noteTarget, setNoteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  /**
   * The chat panel, over the same fixtures and the same local store the chat
   * scene runs on.
   *
   * **The slot cannot simply be left empty here.** A scene mocks the whole page
   * as the role meets it, and chat is a section of this page — so the room shows
   * the composition in place, at the width and height the room actually grants
   * it, while `/preview/chat/session` stays the design's one home for the states
   * themselves. Sharing the store is what keeps the two from forking: this scene
   * adds no fixture of its own, it just picks who is looking.
   */
  const chat = useChatSceneStore(
    now,
    isStaff ? CHAT_ACCOUNT_IDS.sanna : CHAT_ACCOUNT_IDS.aino,
  );
  const chatViewer =
    CHAT_SCENE_ACCOUNTS.find((account) => account.id === chat.viewerId) ??
    CHAT_SCENE_ACCOUNTS[0];

  /**
   * The chat lock the rail offers, over the same fixtures — **derived by the
   * production function, not decided here.** The scene feeds
   * `deriveChatLockControl` real fixture state and gets real answers back, which
   * is what makes this scene worth looking at: the Gedu scenario shows the
   * control on Aino, Siiri and Marja, points it at *unlock* for Väinö (whom the
   * fixtures have locked), and offers nothing against Sanna herself. The gamer
   * scenario is handed the identical function and gets `null` everywhere,
   * because Aino is not a moderator — the same code path that keeps a child from
   * seeing it live.
   *
   * The five members of the room who are not on the *chat* roster — Elias,
   * Linnéa, Oskar, Emil and Hilda — get no control either, which is the
   * voice-only case the rail has to keep refusing: being in the call is not
   * being in the channel.
   */
  const participantChatControls: ParticipantChatControls = (userId) => {
    const direction = deriveChatLockControl(
      chatViewer,
      CHAT_SCENE_ACCOUNTS.find((account) => account.id === userId) ?? null,
      chat.lockedIds.has(userId),
    );
    if (direction === null) return null;
    return {
      direction,
      onSetLock: (locked) => chat.setLock(userId, locked),
    };
  };

  const zones = composeZones(VOICE_ROOM_CUSTOM_ZONES, "preview-group");
  const participantsByZone = new Map<string, VoiceParticipant[]>();
  for (const zone of zones) participantsByZone.set(zone.id, []);
  for (const p of participants) participantsByZone.get(p.zoneId)?.push(p);

  const local = participants.find((p) => p.isLocal);
  const noop = () => {};
  const asyncNoop = async () => {};

  const value: VoiceRoomContextValue = {
    joined: true,
    joining: false,
    callObject: null,
    localSessionId: local?.sessionId ?? "s-staff",
    localRole: isStaff ? "gedu" : "gamer",
    isModerator: isStaff,
    groupId: "preview-group",
    participants,
    zones,
    customZones: VOICE_ROOM_CUSTOM_ZONES,
    currentZoneId: local?.zoneId ?? "lobby",
    participantsByZone,
    moveSelfToZone: noop,
    moveParticipantToZone: noop,
    createZone: asyncNoop,
    updateZone: asyncNoop,
    deleteZone: asyncNoop,
    micOn: true,
    cameraOn: false,
    cameraAllowed: true,
    toggleMic: noop,
    toggleCamera: noop,
    screenSharerSessionId: null,
    canScreenShare: isStaff,
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
    getAnalyser: () => null,
    join: asyncNoop,
    leave: asyncNoop,
  };

  /**
   * The overlay, or nothing at all for the child.
   *
   * **The family scenario passes `null` rather than an empty overlay**, because
   * that is the shape the safeguarding boundary actually takes: a child's
   * client never makes the staff-scoped read, so there is no overlay to filter
   * — and a scene that handed the room an empty one would be rehearsing a
   * filter the product does not have.
   */
  const flair = isStaff
    ? {
        now,
        members: SEATED_MEMBER_IDS,
        newcomers: fixture.newcomers,
        notes,
        noteEditors: fixture.noteEditors,
        onOpenNote: (id: string, name: string) => setNoteTarget({ id, name }),
      }
    : null;

  return (
    <>
      <VoiceRoomContext.Provider value={value}>
        {/* No wrapper of its own: the live route renders the room straight
            into the dashboard layout's container, and a scene that added a
            width would be judging the room at a width it never has. */}
        <VoiceMemberFlairProvider value={flair}>
          <VoiceRoom
            onLeave={asyncNoop}
            participantChatControls={participantChatControls}
            chat={(heightClassName) => (
              <ChatView
                messages={chat.messages}
                accounts={CHAT_SCENE_ACCOUNTS}
                viewer={chatViewer}
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
      </VoiceRoomContext.Provider>

      {noteTarget !== null && (
        <GamerNoteDialog
          open
          onOpenChange={(open) => {
            if (!open) setNoteTarget(null);
          }}
          name={noteTarget.name}
          note={notes[noteTarget.id] ?? ""}
          lastEditedBy={fixture.noteEditors[noteTarget.id] ?? null}
          onSave={(text) =>
            setNotes(({ [noteTarget.id]: _cleared, ...rest }) =>
              text.length > 0 ? { ...rest, [noteTarget.id]: text } : rest,
            )
          }
        />
      )}
    </>
  );
}
