import type { DailyCall } from "@daily-co/daily-js";
import type { UserRole, VoiceZone, VoiceZoneIcon, VoiceZoneColor } from "@/types";
import type { VoiceZoneView } from "@/lib/voice/zone-composition";
import type { GamePlatform } from "@/lib/constants/game-platforms";
import type { GameAccountExternalId } from "@/components/game-account";
import type { AudioInputDevice } from "./use-mic-devices";
import type { MediaErrorCategory } from "@/lib/voice/media-error";

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
   * The participant's own game identity, decoded from the Daily token's
   * `user_name` field. Which platform (if any) is the *product's* decision, not
   * the participant's: the token route resolves it from the product's topic, so
   * every peer in a room carries the same platform or none at all.
   *
   * `undefined` on all three = the room surfaces no game identity (an instant
   * room, or a topic about no single game account) → the row hides its identity
   * slot. A platform with a `null` username = linked-but-unset → "(Unknown)".
   * See buildUserName / mapParticipant.
   */
  gamePlatform?: GamePlatform;
  gameUsername?: string | null;
  gameExternalId?: GameAccountExternalId | null;
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
  /** Daily session id of the sender. Stable per participant for the session, so
   *  the chat log groups a run of consecutive messages from one person under a
   *  single name header (unlike `userName`, which two people could share). */
  senderId: string;
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
   * A moderator asking a *target* to move itself to a (normal) zone. A client
   * can't set another participant's `userData`, so the mod sends this; the
   * target's client verifies the sender is an owner and then sets its own
   * `userData`. Enforcement here is cosmetic (normal-zone membership isn't a
   * security boundary — private zones use the SFU `canReceive` boundary, driven
   * by the mod-authored `voice_private_zone_occupants` rows).
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
  /** Tap or drag self into a zone. For a private (locked) zone this is
   *  moderator-only (a gamer can't self-enter, and a confined gamer can't
   *  self-leave); a mod entering/leaving also writes/clears their own occupancy
   *  row. No room switch — one Daily room, `canReceive`-enforced privacy. */
  moveSelfToZone: (zoneId: string) => void;
  /** Moderator-only; move another participant into *any* zone — normal or
   *  private. Sends the `moveUser` position message and, for a locked
   *  destination, writes the target's occupancy row (clears it for a normal
   *  one). `userId` is needed for that occupancy write. One path for
   *  placing/freeing anyone; a placed moderator moves the same way. */
  moveParticipantToZone: (sessionId: string, userId: string, zoneId: string) => void;

  // --- custom zone management (moderator, group rooms only) ---
  createZone: (input: {
    /** null → an unnamed zone (identified by icon + color alone). */
    name: string | null;
    icon: VoiceZoneIcon;
    color: VoiceZoneColor;
    isLocked: boolean;
  }) => Promise<void>;
  updateZone: (
    id: string,
    patch: { name?: string | null; icon?: VoiceZoneIcon; color?: VoiceZoneColor },
  ) => Promise<void>;
  /** Deleting a zone moves its occupants back to the lobby. */
  deleteZone: (id: string) => Promise<void>;

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
  /** The current mic/camera acquisition failure (denied/in-use/no-device/…),
   *  or null when media is working. Surfaced in the mic-settings popover. */
  mediaError: MediaErrorCategory | null;

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
    meta?: { sessionOpensAt?: string; audioDeviceId?: string | null },
  ) => Promise<void>;
  leave: () => Promise<void>;
}
