import type { DailyCall } from "@daily-co/daily-js";
import type { UserRole, VoiceZone, VoiceZoneIcon, VoiceZoneColor } from "@/types";
import type { VoiceZoneView } from "@/lib/voice/zone-composition";
import type { AudioInputDevice, MicPermission } from "./use-mic-devices";

/**
 * Voice-room-internal role union. Adds `"guest"` on top of the system roles
 * to cover unauthenticated joiners on instant voice rooms (and authenticated
 * parents/gamers, who are also treated as guests when they join via a public
 * room link). Gating logic uses positive "is mod" checks so guest behavior is
 * the same as gamer — non-mod, no screen share, can't move others.
 */
export type VoiceRole = UserRole | "guest";

// ---------- Participant ----------

export interface VoiceParticipant {
  sessionId: string;
  userId: string;
  role: VoiceRole;
  userName: string;
  /**
   * The participant's own Minecraft username/UUID, decoded from the Daily
   * token's `user_name` field (group rooms only). `null` = linked-but-unset
   * (the badge renders "(Unknown)"); `undefined` = the room doesn't surface
   * Minecraft (instant rooms) → no badge. See buildUserName / mapParticipant.
   */
  minecraftUsername?: string | null;
  minecraftUuid?: string | null;
  audioOn: boolean;
  videoOn: boolean;
  screenShareOn: boolean;
  isLocal: boolean;
  isOwner: boolean;
  isSpeaking: boolean;
  /**
   * The discrete zone the participant is in, read from their Daily `userData`
   * (defaulting to `"lobby"` until/unless set). Replaces the old spatial
   * `position` — membership now syncs through Daily's own participant state, so
   * a late joiner sees everyone's zone with no handshake. See
   * src/components/voice/CLAUDE.md.
   */
  zoneId: string;
  /** Whether this participant is broadcasting (heard in every zone). From `userData`. */
  isBroadcasting: boolean;
}

/** Per-participant zone state mirrored from Daily `userData`, used by the
 *  audio pipeline to decide cross-zone volume. */
export interface ZoneUserData {
  zoneId: string;
  broadcasting: boolean;
}

/**
 * A member of a locked zone, as seen by an *outsider* — sourced from the
 * `voice_locked_placements` DB rows, not from Daily (the outsider isn't
 * connected to the locked room). Only the gamer's id is available, which is all
 * the blurred privacy-screen roster needs (identicon, no name).
 */
export interface LockedMember {
  gamerId: string;
  /** Display name, resolved from a name the viewer's client has seen for this
   *  gamer (they were a main-room participant before being placed). `undefined`
   *  when never seen — the tile falls back to the identicon alone. */
  name?: string;
}

// ---------- Moderator ----------

export interface LockState {
  audio: boolean;
  video: boolean;
}

// ---------- Audio ----------

export interface AudioNodes {
  element: HTMLAudioElement;
  analyserSource: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
}

// ---------- Chat ----------

/**
 * An in-memory chat message. Voice chat is ephemeral — these live only in
 * React state for the duration of the session (cleared on resetState) and are
 * never persisted, matching the "Daily.co is the sole source of truth" voice
 * design. `userName` is snapshotted from the sender's Daily-verified token at
 * send/receive time (not trusted from the message payload), so a peer can't
 * spoof another participant's name.
 */
export interface ChatMessage {
  id: string;
  userName: string;
  text: string;
  isLocal: boolean;
}

// ---------- App Messages ----------

/** App message types sent via Daily.co sendAppMessage.
 *
 *  Note the spatial `posUpdate` handshake is gone — normal-zone membership now
 *  rides on Daily `userData` (see CLAUDE.md), so the only zone message left is
 *  the moderator's targeted `moveUser`. */
export type AppMessage =
  | { type: "lockSync"; lock: LockState }
  /**
   * A moderator asking a *target* to move itself to a zone. A client can't set
   * another participant's `userData`, so the mod sends this; the target's
   * client verifies the sender is an owner and then sets its own `userData`.
   * Enforcement here is cosmetic (normal zones aren't a security boundary —
   * locked zones use the separate-room token gate instead).
   */
  | { type: "moveUser"; targetSessionId: string; zoneId: string }
  | { type: "moderatorMute"; targetSessionId: string; track: "audio" | "video" }
  | { type: "moderatorLock"; targetSessionId: string; track: "audio" | "video"; locked: boolean }
  /**
   * A chat message broadcast to all peers. The sender's identity comes from
   * Daily's verified `fromId` (not the payload), so only `text` travels here.
   */
  | { type: "chatMessage"; text: string }
  /**
   * Broadcast by a moderator on instant voice rooms right before they call
   * the end-for-everyone API. Lets other clients show the friendly
   * `CallEndedScreen` immediately rather than waiting for the Daily
   * disconnect (which would otherwise look like a generic network drop).
   * If a client misses the broadcast, the subsequent `left-meeting` event
   * with a non-user-initiated reason falls through to the same screen.
   */
  | { type: "callEndedByMod" };

// ---------- Context ----------

export interface VoiceRoomContextValue {
  // --- identity / role ---
  joined: boolean;
  joining: boolean;
  callObject: DailyCall | null;
  localSessionId: string | null;
  localRole: VoiceRole;
  isModerator: boolean;
  /** `null` on instant rooms (no group → custom/locked zone features disabled). */
  groupId: string | null;

  // --- participants ---
  participants: VoiceParticipant[];

  // --- zones + membership ---
  zones: VoiceZoneView[];
  /** Raw DB rows for the group's custom zones (for the management UI — the
   *  edit dialog needs the icon/color enum keys, which VoiceZoneView discards). */
  customZones: VoiceZone[];
  currentZoneId: string;
  participantsByZone: Map<string, VoiceParticipant[]>;
  /** zoneId → who's inside a locked zone, from the DB placement rows. Drives the
   *  blurred outsider roster (the viewer isn't in the separate locked room). */
  lockedRoster: Map<string, LockedMember[]>;
  /** Tap or drag self into a zone. For a locked zone this is a moderator-only
   *  room switch; for a confined gamer it's a no-op (placement is mod-only). */
  moveSelfToZone: (zoneId: string) => void;
  /** Moderator-only; moves another participant into a non-locked zone. */
  moveParticipantToZone: (sessionId: string, zoneId: string) => void;
  /** Moderator-only; place a gamer into a locked zone (their client switches
   *  rooms via the placement realtime). */
  placeInLockedZone: (gamerId: string, zoneId: string) => Promise<void>;
  /** Moderator-only; remove a gamer's locked placement (returns them to main). */
  removeFromLockedZone: (gamerId: string) => Promise<void>;

  // --- custom zone management (moderator, group rooms only) ---
  createZone: (input: {
    name: string;
    icon: VoiceZoneIcon;
    color: VoiceZoneColor;
    isLocked: boolean;
  }) => Promise<void>;
  updateZone: (
    id: string,
    patch: { name?: string; icon?: VoiceZoneIcon; color?: VoiceZoneColor },
  ) => Promise<void>;
  /** Deleting a zone moves its occupants back to the lobby. */
  deleteZone: (id: string) => Promise<void>;
  /** Non-null while crossing the room boundary into/out of a locked zone —
   *  drives the "Securing your connection…" transition. `zoneId` is the locked
   *  zone being entered, or null when returning to the main room. */
  roomTransition: { zoneId: string | null } | null;

  // --- media ---
  micOn: boolean;
  cameraOn: boolean;
  cameraAllowed: boolean;
  toggleMic: () => void;
  toggleCamera: () => Promise<void> | void;

  // --- screen sharing ---
  screenSharerSessionId: string | null;
  canScreenShare: boolean;
  isScreenSharing: boolean;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;

  // --- broadcast / deafen (moderators only) ---
  isBroadcasting: boolean;
  toggleBroadcast: () => void;
  isDeafened: boolean;
  toggleDeafen: () => void;

  // --- mic devices / troubleshooting ---
  audioInputs: AudioInputDevice[];
  currentAudioInputId: string | null;
  setAudioInput: (deviceId: string) => Promise<void>;
  micPermission: MicPermission;

  // --- moderation ---
  localLocks: LockState;
  lockStates: Map<string, LockState>;
  muteParticipant: (sessionId: string, track: "audio" | "video") => void;
  lockParticipant: (sessionId: string, track: "audio" | "video", locked: boolean) => void;

  // --- audio analysis (speaking glow) ---
  getAnalyser: (sessionId: string) => AnalyserNode | null;

  // --- chat (ephemeral, app-message-backed) ---
  messages: ChatMessage[];
  sendChatMessage: (text: string) => void;

  // --- lifecycle ---
  join: (
    roomUrl: string,
    token: string,
    meta?: { sessionOpensAt?: string },
  ) => Promise<void>;
  leave: () => Promise<void>;
}
