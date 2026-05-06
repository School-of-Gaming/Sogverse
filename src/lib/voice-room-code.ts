/**
 * Code generator + validator for instant voice rooms.
 *
 * 4 characters from a 32-symbol alphabet (A-Z minus I/O, 2-9 — no 0/1 either).
 * The omitted glyphs are the ones humans most often confuse when reading aloud
 * or copying by hand. ~1M unique codes; we let Daily.co's 409 conflict tell us
 * about collisions rather than maintain our own dedup state.
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

/** Strict format we accept anywhere a code crosses a trust boundary (URL param, request body). */
export const VOICE_ROOM_CODE_REGEX = /^[A-HJ-NP-Z2-9]{4}$/;

/** Generate a fresh code using crypto.getRandomValues. */
export function generateVoiceRoomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** True when `code` matches the canonical 4-char shape. Use BEFORE upper-casing. */
export function isValidVoiceRoomCode(code: string): boolean {
  return VOICE_ROOM_CODE_REGEX.test(code);
}

/**
 * Normalize a user-supplied code (URL param, body field) to the canonical form.
 * Returns null when the input can't be coerced to a valid code — caller should
 * 400 / show "room not found" rather than guess. We deliberately reject codes
 * with disallowed glyphs (0/1/I/O/L) instead of mapping them, because mapping
 * `0 → O` would hide typos rather than surface them.
 */
export function normalizeVoiceRoomCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const upper = input.toUpperCase();
  return isValidVoiceRoomCode(upper) ? upper : null;
}
