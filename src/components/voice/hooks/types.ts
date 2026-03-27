import type { DailyCall } from "@daily-co/daily-js";
import type { UserRole } from "@/types";
import type { ZoneId, SpatialPosition } from "@/lib/constants/spatial";

// ---------- Participant ----------

export interface VoiceParticipant {
  sessionId: string;
  userId: string;
  role: UserRole;
  userName: string;
  audioOn: boolean;
  videoOn: boolean;
  screenShareOn: boolean;
  isLocal: boolean;
  isOwner: boolean;
  isSpeaking: boolean;
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
  | { type: "requestPositions" }
  | { type: "positionSync"; positions: Record<string, SpatialPosition>; locks: Record<string, LockState> }
  | { type: "posUpdate"; sessionId: string; position: SpatialPosition }
  | { type: "moveUser"; targetSessionId: string; position: SpatialPosition }
  | { type: "moderatorMute"; targetSessionId: string; track: "audio" | "video" }
  | { type: "moderatorLock"; targetSessionId: string; track: "audio" | "video"; locked: boolean };

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
  localRole: UserRole;
  getPosition: (sessionId: string) => SpatialPosition;
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
