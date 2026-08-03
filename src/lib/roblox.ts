import { z } from "zod";

/**
 * Roblox account lookup — the counterpart to `mojang.ts`.
 *
 * Two public, unauthenticated Roblox APIs, and both are **server-side only**:
 * `users.roblox.com` refuses the CORS preflight outright and
 * `thumbnails.roblox.com` sends no `access-control-*` headers at all, so the
 * browser cannot call either. Everything here runs behind our own route.
 *
 * The structural difference from Minecraft: there is no mc-heads-style
 * "username straight into an `<img src>`" shortcut. Roblox's legacy direct-image
 * endpoints are gone (they 404), so an avatar costs a second server hop —
 * username → numeric id, then id → a CDN URL. That second hop is rate limited to
 * 60 requests per minute *per IP*, and a serverless fleet shares its IPs, so it
 * must never be reached once per avatar at render time.
 */

const ROBLOX_USERS_API = "https://users.roblox.com/v1/usernames/users";

/**
 * The **bust** render, not the full body.
 *
 * Every Roblox thumbnail is square — the API rejects a non-square size outright
 * — and inside a 1:1 frame the full-body variant draws the figure at about 27%
 * of the frame and 40% of its width, leaving a small person adrift in
 * transparent padding. The bust fills 88% of the frame and 98% of its width, so
 * at the same box size it is legible instead of decorative.
 */
const ROBLOX_AVATAR_API = "https://thumbnails.roblox.com/v1/users/avatar-bust";

/**
 * The render size we ask for. Only certain square sizes are accepted (48, 60,
 * 100, 150, 180, 352, 420, 720). 180 is the smallest of them that still covers
 * our largest box (64px) on a 3× display, so it is sharp everywhere we draw it
 * without shipping a 420px PNG to a thumbnail slot.
 */
const ROBLOX_AVATAR_SIZE = "180x180";

/**
 * The username→id response. Roblox answers a miss with **HTTP 200 and an empty
 * `data` array**, not a 404, so "not found" is an emptiness check rather than an
 * `!res.ok` check. Entries for absent usernames are simply omitted.
 */
const usernamesResponse = z.object({
  data: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      displayName: z.string(),
    }),
  ),
});

/**
 * The id→avatar response. `state` is **not** always `"Completed"`: an avatar
 * that has never been rendered comes back `"Pending"`, and a moderated one comes
 * back `"Blocked"`. Left as a plain string rather than an enum so a state we
 * have not seen parses and then fails the `"Completed"` check, instead of
 * failing the parse and looking like a malformed response.
 */
const avatarResponse = z.object({
  data: z.array(
    z.object({
      targetId: z.number().int().positive(),
      state: z.string(),
      imageUrl: z.string().nullish(),
    }),
  ),
});

/**
 * Roblox usernames, as `auth.roblox.com`'s own validator enforces them:
 * 3–20 characters, only `a-z A-Z 0-9 _`, **at most one** underscore, and never
 * one at either end.
 *
 * Written as two flat alternatives — a run with no underscore, or exactly two
 * runs joined by one — rather than the shorter `[a-zA-Z0-9]+(?:_[a-zA-Z0-9]+)?`.
 * That form nests a quantifier inside an optional group, which is the shape
 * static analysis reads as a backtracking hazard; the alternation says the same
 * thing at star height one and needs no exemption. The length is checked
 * separately, because expressing it as a quantifier here would fight the
 * underscore-position rule.
 */
const USERNAME_RE = /^(?:[a-zA-Z0-9]+|[a-zA-Z0-9]+_[a-zA-Z0-9]+)$/;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 20;

/** A Roblox account, with its avatar resolved if one could be. */
export interface RobloxProfile {
  /** The unique handle, correctly cased as Roblox returns it. */
  username: string;
  /** The numeric account id — the key every other Roblox API takes. */
  userId: number;
  /**
   * What other players see in-game. **Not unique**, and often the only name a
   * child knows to give a game educator, so it is surfaced alongside the handle.
   */
  displayName: string;
  /**
   * A CDN URL for the square bust avatar render, or `null` when Roblox has no
   * image to give (never rendered, moderated, or the thumbnail service refused).
   * Short-lived-resolvable, never a value to persist: the JSON carries
   * `cache-control: no-cache` even though the URL it names is immutable.
   */
  avatarUrl: string | null;
}

export function isValidRobloxUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN_LENGTH &&
    username.length <= USERNAME_MAX_LENGTH &&
    USERNAME_RE.test(username)
  );
}

/**
 * Look up a Roblox account by username. Case-insensitive; the `name` that comes
 * back is the canonical casing. Returns null if there is no such account.
 */
export async function lookupRobloxUser(
  username: string,
): Promise<Omit<RobloxProfile, "avatarUrl"> | null> {
  if (!isValidRobloxUsername(username)) return null;

  const res = await fetch(ROBLOX_USERS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: true,
    }),
  });
  if (!res.ok) return null;

  // External API — anything that isn't the expected shape counts as not found.
  const parsed = usernamesResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return null;

  // The endpoint takes a batch, so a hit is the first (and only) entry. A miss
  // is an empty array on an otherwise successful 200 — this is the branch that
  // stands in for the 404 the Mojang lookup gets. `.at` rather than `[0]`
  // because it is the indexed read that admits it can come back undefined.
  const account = parsed.data.data.at(0);
  if (!account) return null;

  return {
    username: account.name,
    userId: account.id,
    displayName: account.displayName,
  };
}

/**
 * Resolve a bust avatar render for an account id.
 *
 * **Never throws.** The avatar is the decoration on a verification, not the
 * verification — a rate-limited, moderated, or simply-down thumbnail service
 * must degrade to "no picture", not fail the lookup that owns it. Every failure
 * mode, including a rejected fetch, comes back as `null`.
 */
export async function resolveRobloxAvatarUrl(
  userId: number,
): Promise<string | null> {
  const url =
    `${ROBLOX_AVATAR_API}?userIds=${userId}` +
    `&size=${ROBLOX_AVATAR_SIZE}&format=Png&isCircular=false`;

  const res = await fetch(url, {
    // The JSON itself is `no-cache` upstream and names a URL we treat as
    // short-lived, so there is nothing here worth a cached read.
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;

  const parsed = avatarResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return null;

  const thumbnail = parsed.data.data.at(0);
  // "Pending" (never rendered) and "Blocked" (moderated) both mean there is no
  // picture to show, and both come back with `imageUrl: ""` — so the empty
  // string is checked too, rather than trusted to follow from the state.
  if (!thumbnail || thumbnail.state !== "Completed") return null;
  return thumbnail.imageUrl ? thumbnail.imageUrl : null;
}

/**
 * The whole verification in one call: username → account → avatar.
 *
 * Both hops happen server-side so the client makes one round trip and never
 * touches the tightly rate-limited thumbnail service itself. A missing avatar
 * degrades to `avatarUrl: null` rather than failing the verification.
 */
export async function lookupRobloxProfile(
  username: string,
): Promise<RobloxProfile | null> {
  const account = await lookupRobloxUser(username);
  if (!account) return null;

  return {
    ...account,
    avatarUrl: await resolveRobloxAvatarUrl(account.userId),
  };
}
