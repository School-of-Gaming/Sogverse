import { z } from "zod";
import {
  GAME_USERNAME_MAX_LENGTH,
  normalizeGameUsername,
  type GameFigure,
} from "@/lib/constants/game-platforms";

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
 * The **headshot** render — the compact figure, for surfaces where a bust is too
 * tall to earn its space.
 *
 * Its one design virtue is that it is square *and so is Minecraft's face render*:
 * the 1:2-vs-1:1 divergence that forces the full figure's box to differ per
 * platform simply does not exist here, so the compact row has identical geometry
 * on both platforms.
 */
const ROBLOX_HEADSHOT_API =
  "https://thumbnails.roblox.com/v1/users/avatar-headshot";

/**
 * The render size we ask for. Only certain square sizes are accepted (48, 60,
 * 100, 150, 180, 352, 420, 720). 180 is the smallest of them that still covers
 * our largest box (64px) on a 3× display, so it is sharp everywhere we draw it
 * without shipping a 420px PNG to a thumbnail slot.
 */
const ROBLOX_AVATAR_SIZE = "180x180";

/**
 * The headshot's size. The compact box is 32px, so 100 is the smallest accepted
 * size that still covers it on a 3× display — asking for 48 would be soft on
 * every phone.
 */
const ROBLOX_HEADSHOT_SIZE = "100x100";

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
  /**
   * The same account's headshot render, for the compact figure. Same
   * short-lived, never-persisted rules as `avatarUrl`, and the same degradation:
   * `null` rather than a failed verification.
   */
  headshotUrl: string | null;
}

/**
 * Look up a Roblox account by username. Case-insensitive; the `name` that comes
 * back is the canonical casing. Returns null if there is no such account.
 *
 * **Roblox decides what a Roblox name is; this function only asks.** There was a
 * copy of that platform's current signup validator here once, gating the call —
 * and it was wrong about real accounts, because the rules it encoded were
 * introduced long after accounts were, so handles carrying spaces (or anything
 * else the modern validator refuses) were reported as nonexistent by us rather
 * than by Roblox. The name travels in a JSON body, so nothing here needs a shape
 * for it; what is left is the shared normalization and a length no request
 * should carry, both rules about the request rather than about the name.
 */
export async function lookupRobloxUser(
  username: string,
): Promise<Omit<RobloxProfile, "avatarUrl" | "headshotUrl"> | null> {
  // The same normalization and bound the wire schemas apply, restated for the
  // callers that reach this directly — the two layers have to agree, or the name
  // asked about is not the name stored. Format characters out and the ends
  // trimmed (both statements about our own request, not about Roblox handles);
  // then a name with nothing left has nothing to ask about, and one past the
  // bound is a request we would not have accepted in the first place — worth a
  // line here because every call costs a request against a shared budget.
  const name = normalizeGameUsername(username);
  if (name.length === 0 || name.length > GAME_USERNAME_MAX_LENGTH) {
    return null;
  }

  // Never throws, for the same reason the thumbnail path does not: every caller
  // treats the answer as optional and stores an unresolvable name unverified. A
  // connection-level rejection is "no answer", and letting it propagate would
  // turn a Roblox outage into a 500 on every write path that saves a username.
  const res = await fetch(ROBLOX_USERS_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [name],
      excludeBannedUsers: true,
    }),
  }).catch(() => null);
  if (!res?.ok) return null;

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
 * How many account ids one thumbnail request may carry.
 *
 * The endpoint takes a batch on the order of a hundred, and that is the whole
 * reason a list is affordable: the cost that matters is the *request* count
 * against a 60-per-minute-per-IP bucket the entire serverless fleet shares, not
 * the number of ids inside one. A caller asking for more than this is refused
 * rather than silently truncated — a half-answered roster is worse than a clear
 * error, because the missing rows look like accounts with no avatar.
 */
export const ROBLOX_THUMBNAIL_BATCH_MAX = 100;

/**
 * Resolve one kind of thumbnail for many account ids, in **one** request.
 *
 * **Never throws, and degrades per id.** The picture is decoration, not
 * identity: a rate-limited, moderated, or simply-down thumbnail service must
 * come back as "no picture" for the ids it could not answer, never as a failure
 * of the call that asked. Every failure mode — a rejected fetch, a non-OK
 * status, an unparseable body, an id the response simply omits — lands as a
 * `null` against that id.
 */
async function resolveRobloxThumbnails(
  api: string,
  userIds: readonly number[],
  size: string,
): Promise<Map<number, string | null>> {
  const resolved = new Map<number, string | null>(
    userIds.map((id) => [id, null]),
  );
  if (userIds.length === 0) return resolved;

  const url =
    `${api}?userIds=${userIds.join(",")}&size=${size}` +
    `&format=Png&isCircular=false`;

  const res = await fetch(url, {
    // The JSON itself is `no-cache` upstream and names a URL we treat as
    // short-lived, so there is nothing here worth a cached read.
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return resolved;

  const parsed = avatarResponse.safeParse(await res.json().catch(() => null));
  if (!parsed.success) return resolved;

  for (const thumbnail of parsed.data.data) {
    // Keyed by the id the *response* names rather than by position: the endpoint
    // does not promise to answer in the order it was asked, and a positional
    // read would hand one child another child's face — the one failure mode here
    // that is worse than no picture at all.
    if (!resolved.has(thumbnail.targetId)) continue;
    // "Pending" (never rendered) and "Blocked" (moderated) both mean there is no
    // picture to show, and both come back with `imageUrl: ""` — so the empty
    // string is checked too, rather than trusted to follow from the state.
    if (thumbnail.state !== "Completed") continue;
    resolved.set(thumbnail.targetId, thumbnail.imageUrl || null);
  }

  return resolved;
}

/**
 * The renders of one account.
 *
 * **Both keys are always present, and a `null` means one of two things** — the
 * figure was not asked for, or it was and Roblox had no picture. The caller
 * chose the figures, so it is the one party that can already tell those apart,
 * and giving the shape a stable set of keys is worth more here than encoding a
 * distinction its only reader already knows.
 */
export interface RobloxRenders {
  /** The bust render, for the full figure. */
  avatarUrl: string | null;
  /** The headshot render, for the compact figure. */
  headshotUrl: string | null;
}

/** Which endpoint, at which size, feeding which field. One entry per figure. */
const FIGURE_SOURCES: Readonly<
  Record<GameFigure, { api: string; size: string; field: keyof RobloxRenders }>
> = {
  full: {
    api: ROBLOX_AVATAR_API,
    size: ROBLOX_AVATAR_SIZE,
    field: "avatarUrl",
  },
  head: {
    api: ROBLOX_HEADSHOT_API,
    size: ROBLOX_HEADSHOT_SIZE,
    field: "headshotUrl",
  },
};

/**
 * The requested renders for many accounts, **by account id**, in **one upstream
 * request per figure** regardless of how many ids are asked for.
 *
 * This is the production path for a *stored* account, and it is deliberately not
 * the one verification uses. A saved account already carries the numeric id, so
 * the username→id hop is not merely optimisable — it is meaningless, because the
 * id is the fact and the name is the label.
 *
 * **The figures are a parameter because the cost is per figure**, and every
 * surface drawing a stored account today draws the full figure alone. Resolving
 * the headshot alongside it doubled the spend against a 60-per-minute-per-IP
 * bucket to fetch a picture nothing rendered. A caller that needs both (a dense
 * roster) asks for both and pays two; a caller that needs one pays one. Where
 * more than one figure *is* asked for they are fetched together rather than in
 * sequence — independent reads, so the request count is fixed either way and
 * there is no reason to pay for it twice in latency.
 */
export async function resolveRobloxRenders(
  userIds: readonly number[],
  figures: readonly GameFigure[],
): Promise<Map<number, RobloxRenders>> {
  // Deduped: asking for the same figure twice would spend a second request
  // against the shared bucket to overwrite a field with itself.
  const wanted = [...new Set(figures)];

  const resolvedPerFigure = await Promise.all(
    wanted.map(async (figure) => {
      const source = FIGURE_SOURCES[figure];
      return {
        field: source.field,
        urls: await resolveRobloxThumbnails(source.api, userIds, source.size),
      };
    }),
  );

  return new Map(
    userIds.map((id) => {
      const renders: RobloxRenders = { avatarUrl: null, headshotUrl: null };
      for (const { field, urls } of resolvedPerFigure) {
        renders[field] = urls.get(id) ?? null;
      }
      return [id, renders];
    }),
  );
}

/** The URL for one figure out of a resolved set. */
export function robloxRenderUrl(
  renders: RobloxRenders,
  figure: GameFigure,
): string | null {
  return renders[FIGURE_SOURCES[figure].field];
}

/** The bust render — the full figure's picture. */
export async function resolveRobloxAvatarUrl(
  userId: number,
): Promise<string | null> {
  const resolved = await resolveRobloxThumbnails(
    ROBLOX_AVATAR_API,
    [userId],
    ROBLOX_AVATAR_SIZE,
  );
  return resolved.get(userId) ?? null;
}

/** The headshot render — the compact figure's picture. */
export async function resolveRobloxHeadshotUrl(
  userId: number,
): Promise<string | null> {
  const resolved = await resolveRobloxThumbnails(
    ROBLOX_HEADSHOT_API,
    [userId],
    ROBLOX_HEADSHOT_SIZE,
  );
  return resolved.get(userId) ?? null;
}

/**
 * The whole verification in one call: username → account → both renders.
 *
 * Every hop happens server-side so the client makes one round trip and never
 * touches the tightly rate-limited thumbnail service itself. A missing render
 * degrades to `null` rather than failing the verification.
 *
 * **The two thumbnails are fetched together, not in sequence.** They are
 * independent reads of the same account and each is one request against a
 * 60-per-minute-per-IP budget the whole serverless fleet shares — so the cost
 * that matters is the count, which is fixed either way, and there is no reason
 * to pay for it twice over in latency. This does take one verification from two
 * upstream calls to three; the cache that this rate limit has been asking for is
 * tracked in TODO.md.
 */
export async function lookupRobloxProfile(
  username: string,
): Promise<RobloxProfile | null> {
  const account = await lookupRobloxUser(username);
  if (!account) return null;

  const [avatarUrl, headshotUrl] = await Promise.all([
    resolveRobloxAvatarUrl(account.userId),
    resolveRobloxHeadshotUrl(account.userId),
  ]);

  return { ...account, avatarUrl, headshotUrl };
}
