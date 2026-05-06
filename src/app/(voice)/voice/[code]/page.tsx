import { notFound } from "next/navigation";
import { InstantVoiceHeader } from "@/components/voice/instant/InstantVoiceHeader";
import { InstantVoiceSession } from "@/components/voice/instant/InstantVoiceSession";
import { normalizeVoiceRoomCode } from "@/lib/voice-room-code";

/**
 * Public room page. Anyone with the code in the URL lands here. The page
 * itself doesn't talk to Daily — it hands the validated code to the client
 * component, which orchestrates the lobby and in-call states.
 *
 * Code validation happens here too so a malformed URL goes straight to a
 * 404 instead of rendering a broken lobby that would 400 on join.
 */
export default async function InstantVoicePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = normalizeVoiceRoomCode(rawCode);
  if (!code) {
    // Codes that don't even match the alphabet shape never had a chance of
    // being a real room. Surface as a hard 404 rather than a "room not
    // found" page — the latter is for valid-shape codes that don't exist.
    notFound();
  }

  return (
    <>
      <InstantVoiceHeader code={code} />
      <InstantVoiceSession code={code} />
    </>
  );
}
