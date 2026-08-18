/**
 * The Daily.co `user_name` pipe-encoding, defined and decoded in one place.
 *
 * `buildUserName` (server, token routes) writes the slots; `parseUserName`
 * (client, participant rendering + chat) reads them back. Both live here so
 * the slot layout —
 * `userId|role|displayName|gamePlatform|gameUsername|gameExternalId` — has a
 * single source of truth. This module is pure (no env, no fetch, no React), so
 * it is safe to import from both server routes and client components.
 */

import { Constants } from "@/types";
import {
  SUPPORTED_GAME_PLATFORMS,
  type GamePlatform,
} from "@/lib/constants/game-platforms";

/**
 * Every role a voice participant can carry: the four DB user roles plus
 * "guest" (instant-room joiners without an account). Runtime counterpart of
 * `VoiceRole` in src/components/voice/hooks/types.ts (`UserRole | "guest"`) —
 * both derive from the user_role enum, so they can't drift.
 */
export const VOICE_ROLES = [...Constants.public.Enums.user_role, "guest"] as const;
export type VoiceRole = (typeof VOICE_ROLES)[number];

function isVoiceRole(value: string): value is VoiceRole {
  return (VOICE_ROLES as readonly string[]).includes(value);
}

function isGamePlatform(value: string): value is GamePlatform {
  return (SUPPORTED_GAME_PLATFORMS as readonly string[]).includes(value);
}

/**
 * A game account's key as it crosses the wire: a Mojang UUID is a string, a
 * Roblox account id is an int64. Spelled out here rather than imported from the
 * game-account component directory, which is a client module full of hooks and
 * JSX — a token route pulling that in would drag a component tree into a server
 * bundle. Structurally identical to the row's own `GameAccountExternalId`, so a
 * parsed value feeds the row with no conversion.
 */
export type GameExternalId = string | number;

/**
 * Build the `user_name` field for Daily.co meeting tokens.
 *
 * The format is pipe-delimited `userId|role|displayName` so the client can
 * decode role + identity from the participant data without a DB lookup.
 *
 * A room whose product is about a game account appends three more slots —
 * `userId|role|displayName|gamePlatform|gameUsername|gameExternalId` — carrying
 * the joiner's *own* identity on that platform. This is the only way peers can
 * render it: the account tables' RLS forbids reading another user's row, so a
 * per-participant client query is impossible. Each token carries only its
 * owner's data (read server-side, where a self-read is always allowed), and
 * Daily broadcasts `user_name` to every peer.
 *
 * **The platform slot is the gate.** A caller passing a platform signals a room
 * that surfaces a game identity, and all three slots are emitted together (the
 * username/id may be empty → the client renders "(Unknown)"). A caller passing
 * no platform — an instant room, or a product whose topic is about no single
 * game account — leaves a 3-segment name the client reads as "no game context"
 * and hides the slot entirely.
 *
 * The account key crosses as text: a Mojang UUID is already one, a Roblox id
 * goes over as its decimal string and `parseUserName` turns it back into a
 * number.
 *
 * Pipe characters are stripped from every dynamic slot because the client
 * parser splits on `|` — if a guest could embed a `|` in their name, they
 * could spoof the `role` slot and have their avatar render with an "admin"
 * badge. The Daily-side `is_owner` flag (set server-side) is the actual
 * permission authority, so this is cosmetic only, but worth preventing —
 * guests pick their own names on instant voice rooms.
 *
 * **The strip on the game-username slot is load-bearing too, and is not to be
 * removed as redundant.** It once looked that way, on the strength of a format
 * rule that no longer exists: a game username is free-form now — we hold no
 * opinion about its shape, only a length bound — so anyone can store
 * `x|admin|Someone` as an unverified handle, and the platform never has to have
 * heard of it. Stripping here is the only thing keeping the slots positionally
 * stable. (The account key is still a UUID or a decimal id, so its strip really
 * is belt-and-braces — but it costs nothing and the three slots are written
 * together.)
 */
export function buildUserName(parts: {
  userId: string;
  role: string;
  displayName: string;
  /** Omitted or `null` → no game slots at all. Present → all three are emitted. */
  gamePlatform?: GamePlatform | null;
  gameUsername?: string | null;
  gameExternalId?: GameExternalId | null;
}): string {
  const safeName = parts.displayName.replaceAll("|", "");
  const base = `${parts.userId}|${parts.role}|${safeName}`;

  if (!parts.gamePlatform) return base;

  const safeUsername = (parts.gameUsername ?? "").replaceAll("|", "");
  const safeExternalId = String(parts.gameExternalId ?? "").replaceAll("|", "");
  return `${base}|${parts.gamePlatform}|${safeUsername}|${safeExternalId}`;
}

/** Decoded `user_name` slots. Counterpart to {@link buildUserName}. */
export interface ParsedUserName {
  /** Slot 0. Empty string when absent; callers fall back to `session_id`. */
  userId: string;
  /** Slot 1. Validated against {@link VOICE_ROLES} — parsing throws otherwise. */
  role: VoiceRole;
  /** Slot 2. Falls back to `"Unknown"` when absent. */
  displayName: string;
  /**
   * Slot 3, and the gate for the two below. `undefined` = the room surfaces no
   * game identity (an instant room, or a topic about no single game account) →
   * the row hides its identity slot entirely. A platform value means the slot
   * renders, even if the username below is empty.
   */
  gamePlatform: GamePlatform | undefined;
  /**
   * Slot 4. `undefined` when there is no game context at all; `null` when the
   * slot is present but empty (the room surfaces this platform and the joiner
   * has no linked account → "(Unknown)").
   */
  gameUsername: string | null | undefined;
  /**
   * Slot 5. Same `undefined`/`null` semantics as `gameUsername`, and `null`
   * additionally covers an unverified handle (a name with no confirmed
   * account). A Roblox id comes back as a **number**, a Mojang UUID as the
   * string it went over as.
   */
  gameExternalId: GameExternalId | null | undefined;
}

/** No game context: the three game fields, absent together. */
const NO_GAME_CONTEXT = {
  gamePlatform: undefined,
  gameUsername: undefined,
  gameExternalId: undefined,
} as const;

/**
 * Decode the pipe-delimited `user_name` produced by {@link buildUserName}.
 *
 * The game slots' *presence* is the identity gate: an absent platform slot
 * (`undefined`) means "this room doesn't surface a game identity" → no row,
 * while a present platform with an empty username (`null`) means "gedu/gamer
 * with no linked account" → "(Unknown)". Because `buildUserName` strips `|`
 * from **both** the display name and the game username — the two free-form
 * slots, neither of which has any format rule behind it — a name a person chose
 * can never bleed into the slots after it, in either direction.
 *
 * **Three layouts are accepted, because a room outlives a deploy.** A token is
 * minted once at join and lives for the whole session window, so a deploy
 * landing mid-window puts both formats in one live room at the same time:
 *
 * - **6 slots** — the current layout. An unrecognised platform value degrades
 *   to no game context rather than throwing: these slots are cosmetic, and one
 *   peer minted by a newer deploy must not blank itself out of everyone's
 *   roster. (Contrast the role slot, which throws — it drives moderator UI.)
 * - **5 slots** — the legacy Minecraft-only layout
 *   (`…|minecraftUsername|minecraftUuid`). Read as platform `minecraft`, which
 *   is what it always was.
 * - **3 slots** — an instant room, which carries no game context at all.
 *
 * **Throws** when the role slot isn't a known voice role (including when the
 * name has no pipe separators at all). Our token routes are the only writers
 * of `user_name`, so a malformed role is a token-generation bug — surface it
 * loudly instead of papering over it with a sentinel role.
 */
export function parseUserName(userName: string | null | undefined): ParsedUserName {
  const parts = (userName || "").split("|");
  const role = parts[1] || "";
  if (!isVoiceRole(role)) {
    throw new Error(
      `Malformed Daily user_name ${JSON.stringify(userName ?? "")}: role slot ${JSON.stringify(role)} is not a voice role`,
    );
  }

  const head = {
    userId: parts[0] || "",
    role,
    displayName: parts[2] || "Unknown",
  };

  if (parts.length >= 6) {
    const platform = parts[3] || "";
    if (!isGamePlatform(platform)) return { ...head, ...NO_GAME_CONTEXT };
    return {
      ...head,
      gamePlatform: platform,
      gameUsername: parts[4] || null,
      gameExternalId: decodeExternalId(platform, parts[5]),
    };
  }

  // Legacy Minecraft-only layout: the two trailing slots were always the
  // Minecraft handle and its Mojang UUID.
  if (parts.length > 3) {
    return {
      ...head,
      gamePlatform: "minecraft",
      gameUsername: parts[3] || null,
      gameExternalId: parts[4] || null,
    };
  }

  return { ...head, ...NO_GAME_CONTEXT };
}

/**
 * Turn the account-key slot back into the shape its platform stores it in: a
 * Roblox int64 comes back as a number, a Mojang UUID as the string it is.
 *
 * A Roblox slot that isn't a clean integer reads as `null` — an unverified row,
 * which is the honest answer and the safe one: `null` draws the silhouette,
 * where a `NaN` would reach a thumbnail endpoint expecting an id.
 */
function decodeExternalId(
  platform: GamePlatform,
  raw: string | undefined,
): GameExternalId | null {
  if (!raw) return null;
  if (platform !== "roblox") return raw;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
