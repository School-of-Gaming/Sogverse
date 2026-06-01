import type { DailyCall } from "@daily-co/daily-js";
import type { UserRole } from "@/types";
import type { ZoneId, SpatialPosition } from "@/lib/constants/spatial";

/**
 * Voice-room-internal role union. Adds `"guest"` on top of the system roles
 * to cover unauthenticated joiners on instant voice rooms (and authenticated
 * parents/gamers, who are also treated as guests when they join via a public
 * room link). Gating logic uses positive "is mod" checks so guest behavior is
 * the same as gamer — non-mod, no screen share, can't drag others.
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
  position: SpatialPosition;
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

// ---------- App Messages ----------

/** App message types sent via Daily.co sendAppMessage */
export type AppMessage =
  | { type: "posUpdate"; sessionId: string; position: SpatialPosition }
  | { type: "lockSync"; lock: LockState }
  | { type: "moveUser"; targetSessionId: string; position: SpatialPosition }
  | { type: "moderatorMute"; targetSessionId: string; track: "audio" | "video" }
  | { type: "moderatorLock"; targetSessionId: string; track: "audio" | "video"; locked: boolean }
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
  joined: boolean;
  joining: boolean;
  participants: VoiceParticipant[];
  micOn: boolean;
  cameraOn: boolean;
  cameraAllowed: boolean;
  join: (roomUrl: string, token: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => Promise<void> | void;
  callObject: DailyCall | null;
  // Spatial extensions
  localZone: ZoneId;
  localRole: VoiceRole;
  moveLocal: (x: number, y: number) => void;
  moveOther: (targetSessionId: string, x: number, y: number) => void;
  // Audio analysis
  getAnalyser: (sessionId: string) => AnalyserNode | null;
  // Volume control
  volumeMultipliers: Map<string, number>;
  setParticipantVolume: (sessionId: string, volume: number) => void;
  // Screen sharing
  screenSharerSessionId: string | null;
  canScreenShare: boolean;
  isScreenSharing: boolean;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  // Moderator controls
  localLocks: LockState;
  lockStates: Map<string, LockState>;
  muteParticipant: (sessionId: string, track: "audio" | "video") => void;
  lockParticipant: (sessionId: string, track: "audio" | "video", locked: boolean) => void;
}
