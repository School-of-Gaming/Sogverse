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
    // Without this flag, Daily.co treats `exp` as a "no new operations past
    // this point" boundary and lets existing WebRTC connections zombie
    // until they drop naturally — peers see ghosts (tiles present, no
    // audio/video) and never get a `left-meeting` event to react to.
    // `eject_at_room_exp: true` makes Daily actively close connections at
    // `exp`, which fires `left-meeting` on every client and lets the UI
    // transition to the ended screen.
    eject_at_room_exp: true,
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
 * Format: `g-{groupId}-{YYYYMMDDHHMM}` where the timestamp is the session
 * window's open time formatted in the product's timezone. Same group +
 * same session window = same name, so every joiner derives the same room
 * independently with no coordination.
 *
 * Both pieces are load-bearing. The full groupId rules out cross-group
 * collisions — under `getOrCreateDailyRoom`, two groups sharing a name
 * would silently land in each other's call (GET returns the first
 * group's room as if it were the second's). The timestamp rules out
 * cross-session collisions — Daily reaps rooms at their `exp` but not
 * atomically, so a stale prior-session room could otherwise be handed
 * to a new joiner with its already-passed `exp`.
 *
 * Wall-clock formatting in the product timezone keeps the name stable
 * across DST transitions.
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
  return `g-${params.groupId}-${windowToken}`;
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
 *
 * `expUnix` (and any other `properties` on `config`) only apply when this
 * call actually creates the room. If the room already exists, the existing
 * room's properties win — callers should derive `expUnix` from a property
 * of `config.name` itself (e.g. the encoded session window in
 * `groupVoiceRoomName`) so racing callers compute the same value and the
 * caller-set-vs-creator-set distinction stops mattering.
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
 * Group-room tokens append two more slots —
 * `userId|role|displayName|minecraftUsername|minecraftUuid` — carrying the
 * joiner's *own* Minecraft identity. This is the only way peers can render
 * the Minecraft badge: `minecraft_accounts` RLS forbids reading another
 * user's row, so a per-participant client query is impossible. Each token
 * carries only its owner's data (read server-side, where a self-read is
 * always allowed), and Daily broadcasts `user_name` to every peer.
 *
 * The slots are emitted whenever `minecraftUsername`/`minecraftUuid` are
 * passed at all (even as `null` → empty slot, which the client renders as
 * "(Unknown)"). Callers that don't surface Minecraft (instant rooms) omit
 * them, leaving a 3-segment name the client reads as "no badge."
 *
 * Pipe characters are stripped from every dynamic slot because the client
 * parser splits on `|` — if a guest could embed a `|` in their name, they
 * could spoof the `role` slot and have their avatar render with an "admin"
 * badge. The Daily-side `is_owner` flag (set server-side) is the actual
 * permission authority, so this is cosmetic only, but worth preventing —
 * guests pick their own names on instant voice rooms. (Minecraft usernames
 * and UUIDs can't contain `|`, but stripping keeps the slots positionally
 * stable regardless.)
 */
export function buildUserName(parts: {
  userId: string;
  role: string;
  displayName: string;
  minecraftUsername?: string | null;
  minecraftUuid?: string | null;
}): string {
  const safeName = parts.displayName.replaceAll("|", "");
  const base = `${parts.userId}|${parts.role}|${safeName}`;

  // Opt-in: a caller passing either Minecraft field (even null) signals a
  // room that surfaces the badge, so always emit both slots together.
  if (parts.minecraftUsername !== undefined || parts.minecraftUuid !== undefined) {
    const safeMcUsername = (parts.minecraftUsername ?? "").replaceAll("|", "");
    const safeMcUuid = (parts.minecraftUuid ?? "").replaceAll("|", "");
    return `${base}|${safeMcUsername}|${safeMcUuid}`;
  }

  return base;
}

interface CreateTokenOptions {
  roomName: string;
  /** Owners can moderate (mute, lock, screen share). Non-owners cannot. */
  isOwner: boolean;
  userName?: string;
  /**
   * Token expiry as a Unix timestamp (seconds). Required — callers must
   * pick a deliberate value (scheduled rooms use `windowClosesAt + grace`,
   * instant rooms use `now + INSTANT_ROOM_EXP_SECONDS`). No default; a
   * silent fallback would let new callers inherit semantics that don't
   * match their flow.
   */
  expUnix: number;
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
        exp: options.expUnix,
        // See the comment on `eject_at_room_exp` in createDailyRoom — same
        // reason, applied at the per-participant level. Without this,
        // Daily lets the token expire silently and the WebRTC connection
        // zombies.
        eject_at_token_exp: true,
      },
    }),
  });

  return result.token;
}
