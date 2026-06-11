/**
 * The Daily.co `user_name` pipe-encoding, defined and decoded in one place.
 *
 * `buildUserName` (server, token routes) writes the slots; `parseUserName`
 * (client, participant rendering + chat) reads them back. Both live here so
 * the slot layout — `userId|role|displayName|minecraftUsername|minecraftUuid`
 * — has a single source of truth. This module is pure (no env, no fetch), so
 * it is safe to import from both server routes and client components.
 */

import { Constants } from "@/types";

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

/** Decoded `user_name` slots. Counterpart to {@link buildUserName}. */
export interface ParsedUserName {
  /** Slot 0. Empty string when absent; callers fall back to `session_id`. */
  userId: string;
  /** Slot 1. Validated against {@link VOICE_ROLES} — parsing throws otherwise. */
  role: VoiceRole;
  /** Slot 2. Falls back to `"Unknown"` when absent. */
  displayName: string;
  /**
   * Slot 3. `undefined` = no Minecraft slots emitted (instant rooms → no
   * badge); `null` = slot present but empty (linked-but-unset → "(Unknown)").
   */
  minecraftUsername: string | null | undefined;
  /** Slot 4. Same `undefined`/`null` semantics as `minecraftUsername`. */
  minecraftUuid: string | null | undefined;
}

/**
 * Decode the pipe-delimited `user_name` produced by {@link buildUserName}.
 *
 * The Minecraft slots' *presence* is the badge gate: an absent slot
 * (`undefined` — instant rooms never emit them) means "this room doesn't
 * surface Minecraft" → no badge, while a present-but-empty slot (`null`)
 * means "gedu/gamer with no linked account" → "(Unknown)". Because
 * `buildUserName` strips `|` from `displayName`, a real name can never bleed
 * into the Minecraft slots.
 *
 * **Throws** when the role slot isn't a known voice role (including when the
 * name has no pipe separators at all). Our token routes are the only writers
 * of `user_name`, so a malformed value is a token-generation bug — surface it
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
  const hasMinecraft = parts.length > 3;
  return {
    userId: parts[0] || "",
    role,
    displayName: parts[2] || "Unknown",
    minecraftUsername: hasMinecraft ? parts[3] || null : undefined,
    minecraftUuid: hasMinecraft ? parts[4] || null : undefined,
  };
}
