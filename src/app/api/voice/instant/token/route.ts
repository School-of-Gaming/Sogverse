import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { getUserWithProfile } from "@/lib/supabase/server";
import { instantRoomModerator } from "@/lib/voice/instant-room-moderator";
import { createMeetingToken, getDailyRoom, buildUserName } from "@/lib/daily";
import { normalizeVoiceRoomCode } from "@/lib/voice-room-code";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";
import { VOICE_CONFIG } from "@/lib/constants/voice";

/**
 * The lobby's join request. Every field is optional and everything else is
 * dropped: the schema is what makes "role", "owner" and "userId" in the body
 * unreadable rather than merely unread, so a future edit cannot start trusting
 * one by accident. Ownership comes from the server-side session lookup below.
 *
 * `displayName` is only read at all when the request has no session (everyone
 * signed in — moderator or not — joins under their profile name), so the schema
 * takes any string and the signed-out branch applies the shared display-name
 * bounds.
 *
 * The two media flags degrade to `undefined` instead of failing the request:
 * they are lobby preferences, not authorization, and an older client sending a
 * stringly-typed value should still be able to join with the defaults rather
 * than be refused at the door.
 */
const instantRoomTokenBody = z.object({
  code: z.string().optional(),
  displayName: z.string().optional(),
  micOn: z.boolean().optional().catch(undefined),
  cameraOn: z.boolean().optional().catch(undefined),
});

/**
 * Mint a Daily.co meeting token for an instant voice room.
 *
 * **Public endpoint — auth is optional.** Anyone with the room code can join.
 * There are three outcomes, and **permission and identity are separate axes**:
 *
 *   1. **Moderator** (admin or *verified* gedu) — `is_owner: true`, role slot
 *      `admin`/`gedu`, profile identity.
 *   2. **Signed-in non-moderator** (parent, gamer, unverified gedu) — guest
 *      permissions (`is_owner: false`, role slot `guest`) but **their own**
 *      identity: profile id and profile first name. You join as yourself.
 *   3. **Signed-out** — guest permissions and a throwaway server-minted UUID
 *      with the name typed in the lobby.
 *
 * The role slot is the *permission* label, not identity: every client gate is a
 * positive `role === "admin" || role === "gedu"` check, so leaving it `guest`
 * for every non-owner is what makes guest behavior fall out for free. Putting a
 * real role there for a signed-in non-mod would light up cosmetic mod UI the
 * server then refuses.
 *
 * **Security invariants** — see `src/components/voice/instant/CLAUDE.md` for the full
 * threat model. Briefly:
 *
 *   - `isOwner` is derived purely from the server-side session lookup. The
 *     request body is never consulted for role/owner/userId. Body fields
 *     with those names are ignored (and our integration test pins this).
 *   - Identity for a signed-in joiner comes from the session too, never from
 *     the body — the body's `displayName` is not even read on that path.
 *   - On any auth-detection failure (no session, profile lookup error,
 *     role isn't admin/gedu, or an *unverified* gedu) we fall through to a
 *     guest token. There is no scenario where ambiguous auth grants ownership;
 *     a session we can't resolve to a profile lands on the signed-out path and
 *     has to type a name like anyone else.
 *   - Signed-out UUIDs are generated server-side via `crypto.randomUUID()` so a
 *     guest can't pick a UUID that produces a chosen identicon.
 *   - The display name is stripped of `|` characters before token encoding
 *     (see `buildUserName`) so a guest can't spoof the role slot of the
 *     pipe-delimited `user_name` field. Cosmetic only — Daily-side
 *     `is_owner` is the actual permission authority — but worth doing.
 */
export async function POST(request: Request) {
  const body = await parseJsonBody(request, instantRoomTokenBody);
  if (body instanceof NextResponse) return body;

  // Lobby preview choices. Default to the historical (mic on, camera off)
  // shape if the client didn't send them — keeps older clients working and
  // the test surface predictable.
  const micOn = body.micOn ?? true;
  const cameraOn = body.cameraOn ?? false;

  // Validate code format BEFORE any Daily API call so a malformed code can't
  // produce a path-traversal request to Daily's API.
  const code = normalizeVoiceRoomCode(body.code);
  if (!code) {
    return NextResponse.json(
      { error: "Invalid room code" },
      { status: 400 },
    );
  }

  // One session read for the whole request. Both the owner gate and the
  // identity branch below take this same snapshot, so they can never disagree
  // about who is asking. (Don't be tempted to call `getUserWithProfile` twice
  // "because it's cached" — React's `cache()` doesn't memoize in a Route
  // Handler, so a second call is a second auth + profile fetch.)
  const session = await getUserWithProfile();

  // Owner eligibility. `instantRoomModerator` is the single predicate for it
  // (admin or *verified* gedu) and returns the moderator identity or null. An
  // unverified gedu resolves to null — being handed any room link must not
  // confer ownership — and it fails closed to null on any lookup error, so
  // there is no path where ambiguous auth grants ownership. We deliberately
  // ignore `requireRole`-style 401/403 short-circuits — this endpoint is public.
  const moderator = await instantRoomModerator(session);

  let userId: string;
  let role: "admin" | "gedu" | "guest";
  let displayName: string;

  if (moderator) {
    role = moderator.role;
    userId = moderator.userId;
    displayName = moderator.displayName;
  } else {
    // Everyone below here gets guest *permissions*. Identity is a separate
    // question, and the same session snapshot answers it: a signed-in parent,
    // gamer or unverified gedu joins as themselves.
    role = "guest";
    const profile = session?.profile;

    if (profile) {
      // The body's `displayName` is not consulted at all — identity for a
      // signed-in joiner comes only from the server session, and the profile
      // name is already bounded by the rules that wrote it.
      userId = session.user.id;
      displayName = profile.first_name;
    } else {
      // Signed out — or a session we couldn't resolve to a profile, which
      // lands here deliberately rather than guessing at an identity.
      userId = crypto.randomUUID();

      // Validate display name shape. Use the same rules as everywhere else
      // (DISPLAY_NAME_MIN/MAX) so the constraint is consistent across the
      // app. We trim before checking because trailing whitespace is just
      // noise in display names.
      const trimmed = body.displayName?.trim() ?? "";
      if (trimmed.length < DISPLAY_NAME_MIN || trimmed.length > DISPLAY_NAME_MAX) {
        return NextResponse.json(
          {
            error: `Display name must be between ${DISPLAY_NAME_MIN} and ${DISPLAY_NAME_MAX} characters`,
          },
          { status: 400 },
        );
      }
      displayName = trimmed;
    }
  }

  // Verify the Daily room actually exists. Distinguishes a code that's
  // never been minted, that's been ended, or that has expired — all three
  // collapse to a single "room not found" UX with the entered code echoed
  // back so users can spot typos.
  const room = await getDailyRoom(code);
  if (!room) {
    return NextResponse.json(
      { error: "room_not_found", code },
      { status: 404 },
    );
  }

  const domain = process.env.NEXT_PUBLIC_DAILY_DOMAIN;
  if (!domain) {
    console.error("Missing NEXT_PUBLIC_DAILY_DOMAIN environment variable");
    return NextResponse.json(
      { error: "Voice chat is not configured" },
      { status: 500 },
    );
  }
  const roomUrl = `https://${domain}.daily.co/${code}`;

  // Same 8h window as the room itself. Each participant's token is its
  // own clock — late joiners get a token that survives past the room's
  // `exp`, but the room's `eject_at_room_exp` always lands first in
  // practice, so the per-token cap is effectively a "no participant sits
  // here longer than INSTANT_ROOM_EXP_SECONDS from their own join"
  // ceiling. Aligns with the room TTL without depending on reading the
  // room's exact `exp` value.
  const expUnix =
    Math.round(Date.now() / 1000) + VOICE_CONFIG.INSTANT_ROOM_EXP_SECONDS;

  const token = await createMeetingToken({
    roomName: code,
    // Positive allow-list, same value as the old `role !== "guest"` on the
    // current 3-member union — flipped so moderator rights never come from
    // excluding a role (isOwner also feeds screen-share at the mint; see
    // CreateTokenOptions). If the union grows, a new role starts as a guest
    // until someone adds it here on purpose.
    isOwner: role === "admin" || role === "gedu",
    userName: buildUserName({ userId, role, displayName }),
    startVideoOff: !cameraOn,
    startAudioOff: !micOn,
    expUnix,
  });

  return NextResponse.json({
    token,
    roomUrl,
    role,
    userId,
    displayName,
  });
}
