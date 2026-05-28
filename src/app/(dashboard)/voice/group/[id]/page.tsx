import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { VoiceSessionPage } from "@/components/voice/VoiceSessionPage";
import { ROUTES } from "@/lib/constants";
import { ROLE_DASHBOARD_PATHS } from "@/lib/constants/roles";
import { getUserWithProfile } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("voiceSession"), description: "Join a voice session" };
}

/**
 * Authenticated group voice room. The `[id]` segment is
 * `product_groups_v2.id` — the token endpoint derives the Daily room name
 * from the group + current session window, so there is no DB-side voice
 * room row to look up.
 *
 * Shared across gamers (participants), gedus (moderators of their assigned
 * product, including sister groups), and admins (moderators everywhere).
 * The proxy gates this branch behind a session via
 * `AUTH_REQUIRED_VOICE_PREFIX`; the token endpoint at `/api/voice/token`
 * does the role + assignment authorization and decides moderator rights.
 *
 * `backHref` is the viewer's role-specific dashboard so leaving the room
 * lands them where their Sessions section lives. Customers are excluded —
 * they only ever reach a voice room through `SwitchToGamerDialog`, which
 * swaps the session to a gamer first, so by the time we're here the role
 * is gamer/gedu/admin.
 */
export default async function VoiceGroupSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const result = await getUserWithProfile();
  const role = result?.profile?.role;

  if (!role || role === "customer") {
    redirect(ROUTES.login);
  }

  return (
    <VoiceSessionPage groupId={id} backHref={ROLE_DASHBOARD_PATHS[role]} />
  );
}
