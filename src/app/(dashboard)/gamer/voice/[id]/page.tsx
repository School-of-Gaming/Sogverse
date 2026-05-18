import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VoiceSessionPage } from "@/components/voice/VoiceSessionPage";
import { ROUTES } from "@/lib/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("voiceSession"), description: "Join a voice session" };
}

/**
 * Gamer voice room. The `[id]` segment is `product_groups_v2.id` — the v2
 * token endpoint derives the Daily room name from the group + the current
 * session window, so there's no `voice_rooms` row to look up.
 *
 * Back link goes to the gamer dashboard (`/gamer`) — the Sessions section
 * is the only in-app surface that produces voice links now that the
 * `/gamer/groups` deprecation is underway (TODO.md "Cleanup" item).
 */
export default async function GamerVoiceSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <VoiceSessionPage
      roomId={id}
      backHref={ROUTES.gamer.dashboard}
      tokenMode="v2"
    />
  );
}
