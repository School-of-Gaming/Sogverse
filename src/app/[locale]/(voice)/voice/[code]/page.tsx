import { InstantVoiceSession } from "@/components/voice/instant/InstantVoiceSession";
import { RoomNotFoundScreen } from "@/components/voice/instant/RoomNotFoundScreen";
import { Copyright } from "@/components/layout";
import { getUserWithProfile } from "@/lib/supabase/server";
import { normalizeVoiceRoomCode } from "@/lib/voice-room-code";

/**
 * Public room page. Anyone with the code in the URL lands here. The page
 * itself doesn't talk to Daily — it hands the validated code to the client
 * component, which orchestrates the lobby and in-call states.
 *
 * Anything under `/voice/<...>` lands on a friendly "room not found" page
 * rather than a hard 404, even when the code is malformed (extra chars,
 * disallowed letters, etc.). Most failures here are typos — the user was
 * trying to reach *some* room — so we echo the typed value back so they
 * can spot the mistake. Page chrome (the standard app header, no footer)
 * comes from the route's layout, so both branches get it.
 */
export default async function InstantVoicePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normalizeVoiceRoomCode(rawCode);

  if (!code) {
    return <RoomNotFoundScreen code={prettifyTypedCode(rawCode)} />;
  }

  // Who's looking, read from the same session the token route reads — so the
  // lobby and the minted token agree on identity. A profile we can't resolve
  // (signed out, or a lookup that failed) is null, which is the signed-out
  // path: type a name, get a server-minted UUID. Nothing about *permissions*
  // is decided here; the token route owns that and treats every non-moderator
  // as a guest regardless.
  const session = await getUserWithProfile();
  const profile = session?.profile;
  const viewer = profile
    ? { id: session.user.id, firstName: profile.first_name }
    : null;

  return (
    <>
      {/* Copyright is rendered here in the server boundary so its year is
          fixed at SSR time — passing it as a prop into the client session
          avoids a client-side getFullYear() that could disagree with the
          server-rendered HTML at year boundaries. */}
      <InstantVoiceSession
        code={code}
        viewer={viewer}
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
