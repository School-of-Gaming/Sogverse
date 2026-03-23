const MOJANG_API = "https://api.mojang.com/users/profiles/minecraft";

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

  const data = (await res.json()) as { name?: string; id?: string };
  if (!data.name || !data.id) return null;

  return {
    username: data.name,
    uuid: formatUuid(data.id),
  };
}

export function isValidMinecraftUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}
