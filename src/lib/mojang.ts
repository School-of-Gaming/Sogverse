import { z } from "zod";
import { GAME_USERNAME_MAX_LENGTH } from "@/lib/constants/game-platforms";

const MOJANG_API = "https://api.mojang.com/users/profiles/minecraft";

const mojangResponse = z.object({ name: z.string(), id: z.string() });

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
 *
 * **Mojang decides what a Minecraft name is; this function only asks.** There
 * was a format check here once that answered "not found" without ever calling
 * out, and it was wrong about real accounts — names issued before the modern
 * rules are shorter than the check's minimum or carry characters it forbade, and
 * every one of those was reported as nonexistent by us rather than by Mojang.
 * The only thing refused now is a length no request should carry; the name is
 * URL-encoded on the way out, so nothing else here needs a shape.
 *
 * **Never throws.** Every caller treats the answer as optional — a name Mojang
 * cannot resolve is still stored, with a null uuid, because it is the child's
 * answer either way. A rejected fetch (DNS failure, connection reset, Mojang
 * simply down) is that same "no answer" and has to arrive as one: letting it
 * propagate would turn an outage at a third party into a 500 on every write path
 * that saves a username, including gamer creation and educator registration,
 * where the account itself has nothing to do with Minecraft.
 */
export async function lookupMinecraftUser(
  username: string,
): Promise<MojangProfile | null> {
  // The same bound the wire schemas apply, restated for the callers that reach
  // this directly. An empty name has nothing to ask about, and a name past the
  // bound is a request we would not have accepted in the first place.
  if (username.length === 0 || username.length > GAME_USERNAME_MAX_LENGTH) {
    return null;
  }

  const res = await fetch(`${MOJANG_API}/${encodeURIComponent(username)}`).catch(
    () => null,
  );
  if (!res?.ok) return null;

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

/**
 * Where a child's full-body skin render comes from.
 *
 * A third-party host (`mc-heads.net`) that the CSP's `img-src` already allows —
 * it renders whatever skin the account is currently wearing, which is the whole
 * point: a costume a child changes on Tuesday shows up here on Wednesday
 * without us storing a byte of it.
 *
 * Named here rather than spelled out at each call site because the host is the
 * CSP-coupled part: a surface that reaches for a different one renders a blocked
 * image and nothing on screen says why. The `body` path (rather than a head
 * crop) is deliberate too — the half of a skin a child actually chose is below
 * the shoulders — and every box drawn for it assumes the 1:2 figure it returns.
 */
export function minecraftSkinBodyUrl(username: string): string {
  return `https://mc-heads.net/body/${encodeURIComponent(username)}`;
}

/**
 * The same skin's **face**, for the compact figure — the flat 2D crop, not the
 * isometric `head` render.
 *
 * Kept beside the body URL because they are the same coupling: one host, one CSP
 * allowance, one place to look when either stops rendering.
 *
 * The flat face fills its square frame edge to edge, which is what makes the
 * compact row identical on Minecraft and Roblox — a Roblox headshot fills its
 * frame the same way. The isometric render would not: it draws a cube on the
 * diagonal, leaving roughly a quarter of the frame transparent and every edge
 * aliased, which at 32px reads as a smudge.
 *
 * 96px for a 32px box, so it stays crisp at 3×. A face is natively 8×8, so this
 * is an honest nearest-neighbour upscale rather than invented detail.
 */
export function minecraftSkinFaceUrl(username: string): string {
  return `https://mc-heads.net/avatar/${encodeURIComponent(username)}/96`;
}
