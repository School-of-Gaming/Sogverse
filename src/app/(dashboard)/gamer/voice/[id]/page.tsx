import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VoiceSessionPage } from "@/components/voice/VoiceSessionPage";
import { ROUTES } from "@/lib/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("voiceSession"), description: "Join a voice session" };
}

/**
 * Gamer voice room. The `[id]` segment is `product_groups_v2.id` — the
 * token endpoint derives the Daily room name from the group + current
 * session window, so there is no DB-side voice room row to look up.
 *
 * Back link goes to the gamer dashboard — the Sessions section is the
 * only in-app surface that produces voice links now (`/gamer/groups`
 * deprecation is underway; see TODO.md).
 */
export default async function GamerVoiceSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VoiceSessionPage groupId={id} backHref={ROUTES.gamer.dashboard} />;
}
