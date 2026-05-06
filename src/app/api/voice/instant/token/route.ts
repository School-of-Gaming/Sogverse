import { NextResponse } from "next/server";
import { getUserWithProfile } from "@/lib/supabase/server";
import { createMeetingToken, getDailyRoom, buildUserName } from "@/lib/daily";
import { normalizeVoiceRoomCode } from "@/lib/voice-room-code";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX } from "@/lib/constants";

/**
 * Mint a Daily.co meeting token for an instant voice room.
 *
 * **Public endpoint — auth is optional.** Anyone with the room code can
 * join. The endpoint detects whether the requester is signed in as an
 * admin or gedu and grants moderator (`is_owner: true`) tokens to them;
 * everyone else (signed-out, parents, gamers) gets a guest token.
 *
 * **Security invariants** — see `docs/instant-voice-rooms.md` for the full
 * threat model. Briefly:
 *
 *   - `isOwner` is derived purely from the server-side session lookup. The
 *     request body is never consulted for role/owner/userId. Body fields
 *     with those names are ignored (and our integration test pins this).
 *   - On any auth-detection failure (no session, profile lookup error,
 *     role isn't admin/gedu) we fall through to the guest path. There is
 *     no scenario where ambiguous auth grants ownership.
 *   - Guest UUIDs are generated server-side via `crypto.randomUUID()` so a
 *     guest can't pick a UUID that produces a chosen identicon.
 *   - The display name is stripped of `|` characters before token encoding
 *     (see `buildUserName`) so a guest can't spoof the role slot of the
 *     pipe-delimited `user_name` field. Cosmetic only — Daily-side
 *     `is_owner` is the actual permission authority — but worth doing.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    code: rawCode,
    displayName: rawDisplayName,
    micOn: rawMicOn,
    cameraOn: rawCameraOn,
  } = (body ?? {}) as {
    code?: unknown;
    displayName?: unknown;
    micOn?: unknown;
    cameraOn?: unknown;
  };

  // Lobby preview choices. Default to the historical (mic on, camera off)
  // shape if the client didn't send them — keeps older clients working and
  // the test surface predictable.
  const micOn = typeof rawMicOn === "boolean" ? rawMicOn : true;
  const cameraOn = typeof rawCameraOn === "boolean" ? rawCameraOn : false;

  // Validate code format BEFORE any Daily API call so a malformed code can't
  // produce a path-traversal request to Daily's API.
  const code = normalizeVoiceRoomCode(rawCode);
  if (!code) {
    return NextResponse.json(
      { error: "Invalid room code" },
      { status: 400 },
    );
  }

  // Auth detection. We look up the user's profile if we can; any failure
  // means the requester is treated as a guest. We deliberately ignore
  // `requireRole`-style 401/403 short-circuits — this endpoint is public.
  const session = await getUserWithProfile();

  let userId: string;
  let role: "admin" | "gedu" | "guest";
  let displayName: string;

  // Inline mod detection so TypeScript narrows session and session.profile
  // to non-null inside the block. Defining `isMod` as a separate const
  // boolean above the branch loses the narrowing — TS doesn't track the
  // implication "isMod true → profile non-null" across the const.
  if (
    session?.profile &&
    (session.profile.role === "admin" || session.profile.role === "gedu")
  ) {
    role = session.profile.role;
    userId = session.user.id;
    displayName = session.profile.display_name;
  } else {
    role = "guest";
    userId = crypto.randomUUID();

    // Validate display name shape. Use the same rules as everywhere else
    // (DISPLAY_NAME_MIN/MAX) so the constraint is consistent across the
    // app. We trim before checking because trailing whitespace is just
    // noise in display names.
    const trimmed =
      typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
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

  const token = await createMeetingToken({
    roomName: code,
    isOwner: role !== "guest",
    userName: buildUserName({ userId, role, displayName }),
    startVideoOff: !cameraOn,
    startAudioOff: !micOn,
  });

  return NextResponse.json({
    token,
    roomUrl,
    role,
    userId,
    displayName,
  });
}
