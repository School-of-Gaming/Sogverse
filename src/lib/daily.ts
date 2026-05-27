import { formatInTimeZone } from "date-fns-tz";
import { VOICE_CONFIG } from "@/lib/constants/voice";

const DAILY_API_BASE = "https://api.daily.co/v1";

function getApiKey(): string {
  const key = process.env.DAILY_API_KEY;
  if (!key) {
    throw new Error("Missing DAILY_API_KEY environment variable");
  }
  return key;
}

/**
 * Daily.co API error with the HTTP status preserved. Callers that need to
 * branch on status (e.g. retry on 409 conflict, fall through on 404) should
 * `instanceof DailyApiError` rather than parse error messages.
 */
export class DailyApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "DailyApiError";
  }
}

/**
 * True when an error from `createDailyRoom` means "a room with that name
 * already exists." Daily.co returns this as `400 invalid-request-error`
 * with the literal info string `a room named X already exists` — not the
 * 409 Conflict you'd expect — so callers can't branch on status alone.
 * 409 is matched too in case Daily ever switches to the conventional code.
 */
export function isDailyDuplicateRoomError(err: unknown): boolean {
  if (!(err instanceof DailyApiError)) return false;
  if (err.status === 409) return true;
  return err.status === 400 && err.message.includes("already exists");
}

async function dailyFetch(path: string, options?: RequestInit) {
  const response = await fetch(`${DAILY_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error("Daily.co API error:", response.status, response.statusText, JSON.stringify(body));
    throw new DailyApiError(
      response.status,
      body.info || body.error || `Daily.co API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

interface CreateRoomConfig {
  name: string;
  maxParticipants?: number;
  /**
   * Unix timestamp (seconds) at which Daily.co destroys the room. Used by
   * instant voice rooms to set an 8h hard cap so abandoned rooms don't sit
   * forever. Group rooms don't pass this (they live for the lifetime of the
   * product group and are deleted explicitly).
   */
  expUnix?: number;
}

interface DailyRoom {
  id: string;
  name: string;
  url: string;
  privacy: string;
  created_at: string;
}

export async function createDailyRoom(config: CreateRoomConfig): Promise<DailyRoom> {
  const properties: Record<string, unknown> = {
    max_participants: config.maxParticipants ?? VOICE_CONFIG.MAX_PARTICIPANTS,
    enable_chat: false,
    enable_screenshare: true,
  };
  if (config.expUnix !== undefined) {
    properties.exp = config.expUnix;
  }

  return dailyFetch("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: config.name,
      privacy: "private",
      properties,
    }),
  });
}

export async function getDailyRoom(name: string): Promise<DailyRoom | null> {
  try {
    return await dailyFetch(`/rooms/${encodeURIComponent(name)}`);
  } catch {
    return null;
  }
}

export async function deleteDailyRoom(name: string): Promise<void> {
  await dailyFetch(`/rooms/${encodeURIComponent(name)}`, { method: "DELETE" });
}

/**
 * Deterministic Daily.co room name for a v2 product group's session.
 *
 * Format: `g-{groupId8}-{YYYYMMDDHHMM}` where the timestamp is the session
 * window's open time formatted in the product's timezone. Same group +
 * same session window = same name, so every joiner derives the same room
 * independently with no coordination. Different sessions of the same
 * group (different weeks, different slots) produce distinct names.
 *
 * Wall-clock formatting in the product timezone keeps the wall-clock
 * identity stable across DST transitions.
 */
export function groupVoiceRoomName(params: {
  groupId: string;
  windowOpensAt: Date;
  timezone: string;
}): string {
  const windowToken = formatInTimeZone(
    params.windowOpensAt,
    params.timezone,
    "yyyyMMddHHmm",
  );
  return `g-${params.groupId.slice(0, 8)}-${windowToken}`;
}

/**
 * Get an existing Daily.co room by name, or create it if it doesn't exist.
 *
 * Use only when the room name is **deterministic and authorization-pre-gated**
 * — i.e. callers have already confirmed the user is allowed in this specific
 * room. For random codes (instant rooms), this would be a security regression:
 * a guessed code would silently let the caller join someone else's room.
 *
 * Concurrency: GET-then-POST is racy on a fresh room — two joiners can both
 * see "not found," and one POST will lose with a duplicate-name error. That
 * loss is treated as success (the room exists, which is all the caller needs)
 * by re-fetching and returning the winner's room.
 */
export async function getOrCreateDailyRoom(
  config: CreateRoomConfig,
): Promise<DailyRoom> {
  const existing = await getDailyRoom(config.name);
  if (existing) return existing;

  try {
    return await createDailyRoom(config);
  } catch (err) {
    if (isDailyDuplicateRoomError(err)) {
      const raced = await getDailyRoom(config.name);
      if (raced) return raced;
    }
    throw err;
  }
}

/**
 * Build the `user_name` field for Daily.co meeting tokens.
 *
 * The format is pipe-delimited `userId|role|displayName` so the client can
 * decode role + identity from the participant data without a DB lookup.
 *
 * Pipe characters are stripped from `displayName` because the client parser
 * splits on `|` — if a guest could embed a `|` in their name, they could
 * spoof the `role` slot and have their avatar render with an "admin" badge.
 * The Daily-side `is_owner` flag (set server-side) is the actual permission
 * authority, so this is cosmetic only, but worth preventing — guests pick
 * their own names on instant voice rooms.
 */
export function buildUserName(parts: { userId: string; role: string; displayName: string }): string {
  const safeName = parts.displayName.replaceAll("|", "");
  return `${parts.userId}|${parts.role}|${safeName}`;
}

interface CreateTokenOptions {
  roomName: string;
  /** Owners can moderate (mute, lock, screen share). Non-owners cannot. */
  isOwner: boolean;
  userName?: string;
  /** Custom token expiry as a Unix timestamp (seconds). Defaults to now + TOKEN_EXPIRY_SECONDS. */
  expUnix?: number;
  /**
   * Initial track states at meeting join. The token's `start_*_off` flags
   * override anything passed to `createCallObject`, so the lobby's mic/camera
   * preview choice has to be threaded through here. Defaults preserve the
   * historical group-room behavior (mic on, camera off).
   */
  startVideoOff?: boolean;
  startAudioOff?: boolean;
}

interface DailyToken {
  token: string;
}

export async function createMeetingToken(options: CreateTokenOptions): Promise<string> {
  const exp = options.expUnix ?? Math.round(Date.now() / 1000) + VOICE_CONFIG.TOKEN_EXPIRY_SECONDS;

  const result: DailyToken = await dailyFetch("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: options.roomName,
        is_owner: options.isOwner,
        enable_screenshare: options.isOwner,
        start_video_off: options.startVideoOff ?? true,
        start_audio_off: options.startAudioOff ?? false,
        user_name: options.userName,
        exp,
      },
    }),
  });

  return result.token;
}
