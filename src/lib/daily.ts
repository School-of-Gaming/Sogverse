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

interface DailyFetchOptions extends RequestInit {
  /**
   * Errors the caller treats as normal control flow — an expected miss, not a
   * failure. A matching error is thrown exactly as usual (callers still branch
   * on it); the only difference is that it is not logged at error level here.
   *
   * This exists because the wrapper logs *before* callers decide what a
   * response means, so expected responses used to land in prod error logs as
   * false alarms: the lazy get-or-create's first-joiner GET 404 fired one per
   * session, and each triggered an incident-shaped investigation. Suppression
   * is deliberately predicate-per-call, never global: a status is only quiet
   * where that specific call treats it as an answer, so any Daily error that
   * does reach the logs is genuinely wrong.
   */
  quietError?: (err: DailyApiError) => boolean;
}

async function dailyFetch(path: string, options?: DailyFetchOptions) {
  const { quietError, ...init } = options ?? {};
  const response = await fetch(`${DAILY_API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new DailyApiError(
      response.status,
      body.info || body.error || `Daily.co API error: ${response.status} ${response.statusText}`,
    );
    if (!quietError?.(error)) {
      console.error("Daily.co API error:", response.status, response.statusText, JSON.stringify(body));
    }
    throw error;
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

  const room: DailyRoom = await dailyFetch("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: config.name,
      privacy: "private",
      properties,
    }),
    // Both callers treat a duplicate name as control flow, not failure: the
    // get-or-create race loser falls through to a re-GET, and the instant-room
    // code collision retries with a fresh code. A genuine 400 still logs.
    quietError: isDailyDuplicateRoomError,
  });
  // The one breadcrumb of lazy room creation: rooms are created on demand by
  // the first joiner (or an instant-room mint), so this line is the searchable
  // per-room trace of when and by which name a room came into being.
  console.log(`Created Daily.co room ${room.name}`);
  return room;
}

export async function getDailyRoom(name: string): Promise<DailyRoom | null> {
  try {
    return await dailyFetch(`/rooms/${encodeURIComponent(name)}`, {
      // A miss is an answer, not a failure — this function's contract is
      // "null when the room doesn't exist", and under the lazy-create model
      // every session's first joiner probes a room that isn't there yet.
      quietError: (err) => err.status === 404,
    });
  } catch {
    return null;
  }
}

export async function deleteDailyRoom(name: string): Promise<void> {
  await dailyFetch(`/rooms/${encodeURIComponent(name)}`, {
    method: "DELETE",
    // Deleting a room Daily already reaped (its `exp` passed) answers 404;
    // the caller treats "already gone" as success, so it isn't an error here.
    quietError: (err) => err.status === 404,
  });
}

/**
 * Deterministic Daily.co room name for a product group's session.
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

// The `user_name` pipe-encoding lives in one place (build + parse together).
// Re-exported here so the token routes can keep importing it from `@/lib/daily`.
export { buildUserName, parseUserName } from "@/lib/voice/user-name";
export type { ParsedUserName } from "@/lib/voice/user-name";

interface CreateTokenOptions {
  roomName: string;
  /**
   * Owners can moderate (mute, lock, screen share). Non-owners cannot.
   *
   * **One flag, two Daily properties**: this feeds both `is_owner` and
   * `enable_screenshare` below, so it is the *entire* moderator surface of a
   * token — there is no separate screen-share opt-in a caller could get wrong
   * in one direction. Callers must therefore derive it from a positive
   * allow-list of moderator roles; a negative test ("not a gamer") grants both
   * powers to whichever role is admitted next.
   */
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
  /**
   * The participant's stable id (our `profiles.id`). Set as Daily's `user_id`
   * so peers' `participant.user_id` matches it — which is what `canReceive`'s
   * `byUserId` keys on (group rooms only; instant-room guests have no profile).
   */
  userId?: string;
  /**
   * Baked-in receive permission for the private-zone privacy boundary. When the
   * current session already has private-zone occupants this joiner mustn't
   * receive, the token carries the block so it's enforced *before* they connect
   * — no window where they're sent a private member's media. See
   * `tokenCanReceiveFor` in `src/lib/voice/receive-permissions.ts`.
   */
  canReceive?: { base: boolean; byUserId: Record<string, boolean> };
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
        ...(options.userId !== undefined && { user_id: options.userId }),
        ...(options.canReceive !== undefined && {
          permissions: { canReceive: options.canReceive },
        }),
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
