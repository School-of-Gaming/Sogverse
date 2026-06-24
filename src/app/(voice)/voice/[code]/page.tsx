import { InstantVoiceHeader } from "@/components/voice/instant/InstantVoiceHeader";
import { InstantVoiceSession } from "@/components/voice/instant/InstantVoiceSession";
import { RoomNotFoundScreen } from "@/components/voice/instant/RoomNotFoundScreen";
import { Copyright } from "@/components/layout";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
import { isGeduVerified } from "@/services/gedu/gedu-profiles.service";
import { normalizeVoiceRoomCode } from "@/lib/voice-room-code";

/**
 * Will this viewer get a moderator (owner) token when they join? Mirrors the
 * token route's decision exactly: admin → yes, gedu → only if verified,
 * everyone else → no. Threaded into the lobby so it shows the guest name input
 * (and uses the guest identity) to anyone the server will treat as a guest —
 * without it, an unverified gedu would be shown the mod UI (no name field) and
 * then bounce off the token route's guest-name requirement. Fails closed to
 * "not a moderator" (the safe, guest side) on any lookup error.
 */
async function viewerIsModerator(): Promise<boolean> {
  try {
    const session = await getUserWithProfile();
    const role = session?.profile?.role;
    if (role === "admin") return true;
    if (role === "gedu" && session) {
      return await isGeduVerified(await createClient(), session.user.id);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Public room page. Anyone with the code in the URL lands here. The page
 * itself doesn't talk to Daily — it hands the validated code to the client
 * component, which orchestrates the lobby and in-call states.
 *
 * Anything under `/voice/<...>` lands on a friendly "room not found" page
 * rather than a hard 404, even when the code is malformed (extra chars,
 * disallowed letters, etc.). Most failures here are typos — the user was
 * trying to reach *some* room — so we echo the typed value back so they
 * can spot the mistake. The header's copy-link chip is hidden when the
 * code is invalid because we don't want to offer a copy action that just
 * pastes a broken URL.
 */
export default async function InstantVoicePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normalizeVoiceRoomCode(rawCode);

  if (!code) {
    return (
      <>
        <InstantVoiceHeader />
        <RoomNotFoundScreen code={prettifyTypedCode(rawCode)} />
      </>
    );
  }

  const isModerator = await viewerIsModerator();

  return (
    <>
      <InstantVoiceHeader code={code} />
      {/* Copyright is rendered here in the server boundary so its year is
          fixed at SSR time — passing it as a prop into the client session
          avoids a client-side getFullYear() that could disagree with the
          server-rendered HTML at year boundaries. */}
      <InstantVoiceSession
        code={code}
        isModerator={isModerator}
        copyright={<Copyright className="text-xs" />}
      />
    </>
  );
}

/**
 * Echo the user's typed value back in a readable form. Uppercase to match
 * the canonical code shape, and truncate beyond a sane bound so a 200-char
 * URL doesn't blow out the layout — anything that long is garbage rather
 * than a typo, but we still want the page to render without horizontal
 * scrolling.
 */
function prettifyTypedCode(raw: string): string {
  const upper = raw.toUpperCase();
  return upper.length > 16 ? `${upper.slice(0, 16)}…` : upper;
}
