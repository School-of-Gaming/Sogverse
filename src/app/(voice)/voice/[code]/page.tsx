import { InstantVoiceHeader } from "@/components/voice/instant/InstantVoiceHeader";
import { InstantVoiceSession } from "@/components/voice/instant/InstantVoiceSession";
import { RoomNotFoundScreen } from "@/components/voice/instant/RoomNotFoundScreen";
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

  return (
    <>
      <InstantVoiceHeader code={code} />
      <InstantVoiceSession code={code} />
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
