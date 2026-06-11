import { z } from "zod";

const MOJANG_API = "https://api.mojang.com/users/profiles/minecraft";

const mojangResponse = z.object({ name: z.string(), id: z.string() });

// Minecraft usernames: 3-16 chars, alphanumeric + underscore
const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

export interface MojangProfile {
  username: string; // Correctly-cased name from Mojang
  uuid: string; // UUID with dashes
}

/** Format a raw 32-char hex UUID into 8-4-4-4-12 dashed form. */
function formatUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Look up a Minecraft Java account by username via the Mojang API.
 * Returns the correctly-cased username + dashed UUID, or null if not found.
 */
export async function lookupMinecraftUser(
  username: string,
): Promise<MojangProfile | null> {
  if (!USERNAME_RE.test(username)) return null;

  const res = await fetch(`${MOJANG_API}/${encodeURIComponent(username)}`);
  if (!res.ok) return null;

  // External API — anything that isn't the expected shape (including the
  // empty 204 body Mojang uses for "no such user") counts as not found.
  const parsed = mojangResponse.safeParse(
    await res.json().catch(() => null),
  );
  if (!parsed.success) return null;

  return {
    username: parsed.data.name,
    uuid: formatUuid(parsed.data.id),
  };
}

export function isValidMinecraftUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}
