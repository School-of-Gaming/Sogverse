"use client";

import { useState } from "react";
import { GamerFlairDialog } from "@/components/member-flair";
import { VoiceRoom } from "@/components/voice/VoiceRoom";
import { VoiceRoomContext } from "@/components/voice/VoiceRoomProvider";
import { VoiceMemberFlairProvider } from "@/components/voice/VoiceMemberFlairProvider";
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
import type { GamerCreation } from "@/types";

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
 * **The rail carries all three ways a row can be lit**, because the button says
 * only that *something* is recorded: one member with creations and no note, one
 * with both, one with a note alone, and the rest dimmed. Opening any of them
 * gives the same per-gamer dialog the workspace gives, with its two labelled
 * audiences, and both halves write against local state.
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
/** The list a member with no creations is handed — one identity, every render. */
const NO_CREATIONS: readonly GamerCreation[] = [];

export function VoiceRoomScene({ scenario }: { scenario: VoiceRoomScenario }) {
  const isStaff = scenario === "gedu";

  // One instant for the room, frozen at mount, exactly as the live page hands
  // its rows one request-stable clock. A ticking one would walk the badges
  // forward under whoever is reading them.
  const [now] = useState(() => new Date());
  const [participants] = useState(() => buildParticipants(scenario));
  const [fixture] = useState(() => buildFlairFixture(now));
  const [notes, setNotes] = useState<Record<string, string>>(fixture.notes);
  const [creations, setCreations] = useState<
    Record<string, readonly GamerCreation[]>
  >(fixture.creations);
  const [flairTarget, setFlairTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

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
    messages: [],
    sendChatMessage: noop,
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
        creations,
        onOpenFlair: (id: string, name: string) => setFlairTarget({ id, name }),
      }
    : null;

  return (
    <>
      <VoiceRoomContext.Provider value={value}>
        {/* No wrapper of its own: the live route renders the room straight
            into the dashboard layout's container, and a scene that added a
            width would be judging the room at a width it never has. */}
        <VoiceMemberFlairProvider value={flair}>
          <VoiceRoom onLeave={asyncNoop} />
        </VoiceMemberFlairProvider>
      </VoiceRoomContext.Provider>

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
          // Both halves live against local state, and both spell "none" by
          // dropping the key — which is what puts the row's button back out.
          onSaveCreations={(next) =>
            setCreations(({ [flairTarget.id]: _cleared, ...rest }) =>
              next.length > 0 ? { ...rest, [flairTarget.id]: next } : rest,
            )
          }
        />
      )}
    </>
  );
}
