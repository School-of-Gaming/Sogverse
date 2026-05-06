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
        start_video_off: true,
        start_audio_off: false,
        user_name: options.userName,
        exp,
      },
    }),
  });

  return result.token;
}
