import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import messages from "@/../messages/en.json";
import { VoiceRoomContext } from "@/components/voice/VoiceRoomProvider";
import { VoiceControls } from "@/components/voice/VoiceControls";
import { ParticipantList } from "@/components/voice/ParticipantList";
import {
  VoiceModeratorLocksProvider,
  useTraineeRoomLocks,
} from "@/components/voice/VoiceModeratorLocks";
import { VoiceMemberFlairProvider } from "@/components/voice/VoiceMemberFlairProvider";
import type { VoiceMemberFlair } from "@/components/voice/VoiceMemberFlairProvider";
import { deriveVoiceMemberFlair } from "@/components/voice/derive-voice-member-flair";
import type {
  VoiceParticipant,
  VoiceRoomContextValue,
} from "@/components/voice/hooks/types";

/**
 * ============================================================================
 * The moderator controls a trainee sees: the same ones, locked.
 * ============================================================================
 *
 * Three viewers, three answers, and the room's components learn none of them
 * from a role — every one of the three below carries the role slot `gedu` or
 * `gamer` that the token gave them, and what differs is the owner flag and
 * whether the page handed the room locks:
 *
 *  - a moderator (owner) gets working controls;
 *  - a trainee (not an owner, locks supplied) gets the same controls, each
 *    explaining itself when pressed and performing nothing;
 *  - a gamer (neither) gets no moderator controls at all.
 */

const IDS = {
  sanna: "4a84d001-b789-41f5-ace3-cfcffa139869",
  tiia: "0f7b4155-a74f-434b-b93b-b36ecb920aee",
  aino: "c0b5f0d2-6a0a-4c4f-9a39-2d1e4e1d7f55",
  /** A second trainee, only in the rail case that names one. */
  tuomas: "ce2e631c-f360-4fa7-a248-97540faa2759",
} as const;

function participant(over: Partial<VoiceParticipant> & Pick<VoiceParticipant, "sessionId" | "userId" | "userName">): VoiceParticipant {
  return {
    role: "gamer",
    audioOn: true,
    videoOn: false,
    screenShareOn: false,
    isLocal: false,
    isOwner: false,
    isSpeaking: false,
    zoneId: "lobby",
    isBroadcasting: false,
    ...over,
  };
}

const toggleBroadcast = vi.fn();
const toggleDeafen = vi.fn();
const startScreenShare = vi.fn(async () => {});
const muteParticipant = vi.fn();

function room(
  viewer: "moderator" | "trainee" | "gamer",
  extra: readonly VoiceParticipant[] = [],
): VoiceRoomContextValue {
  const participants = [
    participant({
      sessionId: "s-sanna",
      userId: IDS.sanna,
      userName: "Sanna",
      role: "gedu",
      isOwner: true,
      isLocal: viewer === "moderator",
    }),
    participant({
      sessionId: "s-tiia",
      userId: IDS.tiia,
      userName: "Tiia",
      role: "gedu",
      isLocal: viewer === "trainee",
    }),
    participant({
      sessionId: "s-aino",
      userId: IDS.aino,
      userName: "Aino",
      isLocal: viewer === "gamer",
    }),
    ...extra,
  ];
  const noop = () => {};
  const asyncNoop = async () => {};
  const isModerator = viewer === "moderator";
  return {
    joined: true,
    joining: false,
    callObject: null,
    localSessionId: participants.find((p) => p.isLocal)?.sessionId ?? null,
    localRole: viewer === "gamer" ? "gamer" : "gedu",
    isModerator,
    groupId: "group-1",
    participants,
    zones: [],
    customZones: [],
    currentZoneId: "lobby",
    participantsByZone: new Map(),
    moveSelfToZone: noop,
    moveParticipantToZone: noop,
    createZone: asyncNoop,
    updateZone: asyncNoop,
    deleteZone: asyncNoop,
    micOn: true,
    cameraOn: false,
    cameraAllowed: true,
    toggleMic: noop,
    toggleCamera: asyncNoop,
    screenSharerSessionId: null,
    canScreenShare: isModerator,
    isScreenSharing: false,
    startScreenShare,
    stopScreenShare: noop,
    isBroadcasting: false,
    toggleBroadcast,
    isDeafened: false,
    toggleDeafen,
    audioInputs: [],
    currentAudioInputId: null,
    setAudioInput: asyncNoop,
    mediaError: null,
    localLocks: { audio: false, video: false },
    lockStates: new Map(),
    muteParticipant,
    lockParticipant: noop,
    getAnalyser: () => null,
    join: asyncNoop,
    leave: asyncNoop,
  };
}

/** The page's own wiring: a trainee's page supplies the locks, nobody else's does. */
function Locks({ on, children }: { on: boolean; children: ReactNode }) {
  const locks = useTraineeRoomLocks();
  return (
    <VoiceModeratorLocksProvider value={on ? locks.voice : null}>
      {children}
    </VoiceModeratorLocksProvider>
  );
}

function renderRoom(
  viewer: "moderator" | "trainee" | "gamer",
  flair: VoiceMemberFlair | null = null,
  extra: readonly VoiceParticipant[] = [],
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VoiceRoomContext.Provider value={room(viewer, extra)}>
        <Locks on={viewer === "trainee"}>
          <VoiceMemberFlairProvider value={flair}>
            <VoiceControls />
            <ParticipantList />
          </VoiceMemberFlairProvider>
        </Locks>
      </VoiceRoomContext.Provider>
    </NextIntlClientProvider>,
  );
}

const t = messages.voice;
const trainee = messages.gedu.trainee;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the room's moderator controls, by viewer", () => {
  it("gives a moderator working controls", () => {
    renderRoom("moderator");
    fireEvent.click(screen.getByRole("button", { name: t.broadcast }));
    expect(toggleBroadcast).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gives a trainee the same controls, which explain themselves and do nothing", () => {
    renderRoom("trainee");

    for (const [name, title] of [
      [t.shareScreen, trainee.screenShareTitle],
      [t.broadcast, trainee.broadcastTitle],
      [t.deafen, trainee.deafenTitle],
    ] as const) {
      const button = screen.getByRole("button", { name });
      // Announced as locked before it is pressed, and still a real button.
      const hintId = button.getAttribute("aria-describedby");
      expect(hintId && document.getElementById(hintId)?.textContent).toBe(
        trainee.lockedHint,
      );
      expect(button.hasAttribute("disabled")).toBe(false);

      fireEvent.click(button);
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText(title)).toBeTruthy();
      expect(within(dialog).getByText(trainee.whyAction)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole("button", { name: trainee.dismiss }));
    }

    expect(toggleBroadcast).not.toHaveBeenCalled();
    expect(toggleDeafen).not.toHaveBeenCalled();
    expect(startScreenShare).not.toHaveBeenCalled();
  });

  it("gives a trainee the participant menu locked, on the rows a moderator gets one", () => {
    renderRoom("trainee");
    // Aino's row carries it; Sanna's (an owner) and Tiia's own do not — the
    // same rows a moderator's menu appears on.
    const triggers = screen.getAllByRole("button", { name: t.moderate });
    expect(triggers).toHaveLength(1);

    fireEvent.click(triggers[0]);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(trainee.moderateTitle)).toBeTruthy();
    // The explanation, never the menu.
    expect(screen.queryByText(t.muteMicrophone)).toBeNull();
    expect(muteParticipant).not.toHaveBeenCalled();
  });

  it("gives a gamer no moderator controls at all", () => {
    renderRoom("gamer");
    expect(screen.queryByRole("button", { name: t.broadcast })).toBeNull();
    expect(screen.queryByRole("button", { name: t.shareScreen })).toBeNull();
    expect(screen.queryByRole("button", { name: t.moderate })).toBeNull();
  });
});

describe("the trainee tag on the participant rail", () => {
  const flair: VoiceMemberFlair = {
    now: new Date("2026-09-29T12:00:00.000Z"),
    members: new Set([IDS.aino]),
    newcomers: {},
    notes: {},
    creations: {},
    trainees: new Set([IDS.tiia]),
    onOpenFlair: () => {},
  };

  it("is drawn beside a trainee's name for a viewer with staff sight", () => {
    renderRoom("moderator", flair);
    expect(screen.getAllByText(trainee.badge)).toHaveLength(1);
  });

  it("is drawn for a trainee viewer on their own row and on a fellow trainee's", () => {
    // What the page builds for a trainee: their redacted overlay, carrying the
    // set the chat roster answered them with.
    const traineeFlair = deriveVoiceMemberFlair(
      {
        product_type: "consumer_club",
        members: {
          [IDS.aino]: { group_joined_at: null, has_note: false, creations: [] },
        },
      },
      new Date("2026-09-29T12:00:00.000Z"),
      () => {},
      new Set([IDS.tiia, IDS.tuomas]),
    );
    renderRoom("trainee", traineeFlair, [
      participant({
        sessionId: "s-tuomas",
        userId: IDS.tuomas,
        userName: "Tuomas",
        role: "gedu",
      }),
    ]);

    // The name and the tag are both direct children of the row.
    const rowOf = (name: string) => {
      const row = screen.getByText(name).parentElement;
      if (row === null) throw new Error(`no row for ${name}`);
      return row;
    };
    expect(screen.getAllByText(trainee.badge)).toHaveLength(2);
    for (const name of ["Tiia", "Tuomas"]) {
      expect(within(rowOf(name)).getByText(trainee.badge)).toBeTruthy();
    }
    expect(within(rowOf("Sanna")).queryByText(trainee.badge)).toBeNull();
  });

  it("is drawn for nobody without an overlay", () => {
    renderRoom("gamer");
    expect(screen.queryByText(trainee.badge)).toBeNull();
  });
});
