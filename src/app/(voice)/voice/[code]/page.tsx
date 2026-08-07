import { InstantVoiceSession } from "@/components/voice/instant/InstantVoiceSession";
import { RoomNotFoundScreen } from "@/components/voice/instant/RoomNotFoundScreen";
import { Copyright } from "@/components/layout";
import { instantRoomModerator } from "@/lib/voice/instant-room-moderator";
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

  // Same decision the token route uses to mint the owner token (admin or a
  // verified gedu), so the lobby shows the guest name input to exactly the
  // viewers the server will treat as guests. Null → guest. See
  // `instantRoomModerator` for the rule and its fail-closed behavior.
  const isModerator = (await instantRoomModerator()) !== null;

  return (
    <>
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
