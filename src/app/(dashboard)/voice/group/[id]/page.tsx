import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { VoiceSessionPage } from "@/components/voice/VoiceSessionPage";
import { ROUTES } from "@/lib/constants";
import { ROLE_DASHBOARD_PATHS } from "@/lib/constants/roles";
import { resolveInternalPath } from "@/lib/navigation/internal-path";
import { getUserWithProfile } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("voiceSession"), description: "Join a voice session" };
}

/**
 * Authenticated group voice room. The `[id]` segment is
 * `product_groups.id` — the token endpoint derives the Daily room name
 * from the group + current session window, so there is no DB-side voice
 * room row to look up.
 *
 * Shared across gamers (participants), gedus (moderators of their assigned
 * product, including sister groups), and admins (moderators everywhere).
 * The proxy gates this branch behind a session via
 * `AUTH_REQUIRED_VOICE_PREFIX`; the token endpoint at `/api/voice/token`
 * does the role + assignment authorization and decides moderator rights.
 *
 * `backHref` defaults to the viewer's role-specific dashboard so leaving
 * the room lands them where their Sessions section lives. Callers can
 * override that by passing a `?back=<internal path>` query — used by the
 * gedu session-details page so leaving the voice room returns to the
 * product page the gedu launched from, not the top-level dashboard. The
 * value is run through `resolveInternalPath`, which accepts it only if it
 * resolves to a same-origin path (rejecting `//host`, `/\host`, absolute
 * URLs, etc.) so this surface can't be turned into an open redirect —
 * `backHref` is fed straight to `window.location.href` on leave. Customers
 * are excluded —
 * they only ever reach a voice room through `SwitchProfileDialog`, which
 * swaps the session to a gamer first, so by the time we're here the role
 * is gamer/gedu/admin.
 */
export default async function VoiceGroupSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string | string[] }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const result = await getUserWithProfile();
  const role = result?.profile?.role;

  // `!role` only fires if the profile fetch failed under an authenticated
  // session (proxy already gated unauthenticated visitors). `/login` is the
  // defensible fallback there. Customers, on the other hand, are signed
  // in but landing on the wrong page — send them to their own dashboard
  // instead of bouncing through `/login` and letting the proxy hop them.
  if (!role) {
    redirect(ROUTES.login);
  }
  if (role === "customer") {
    redirect(ROLE_DASHBOARD_PATHS.customer);
  }

  const backHref = resolveInternalPath(sp.back, ROLE_DASHBOARD_PATHS[role]);

  return <VoiceSessionPage groupId={id} backHref={backHref} />;
}
