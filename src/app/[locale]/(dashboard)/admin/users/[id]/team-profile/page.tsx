import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { TeamProfileEditor } from "@/components/team/team-profile-editor";
import { redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
// The service module, not the package index: the index re-exports the
// `"use client"` query hooks, which a Server Component would pull in as client
// references.
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminTeamProfile") };
}

/**
 * `/admin/users/[id]/team-profile` — an admin editing another admin's or a
 * Gedu's profile, checkbox included. The proxy gates `/admin` to admins.
 *
 * The viewer's own profile is edited from their settings, where it speaks to
 * them rather than about them, so their own id redirects there. A role with no
 * profile is not found.
 */
export default async function AdminUserTeamProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await getUserWithProfile();
  if (viewer?.user.id === id) {
    redirect({ href: ROUTES.settingsTeamProfile, locale: await getLocale() });
  }

  const supabase = await createClient();
  // A malformed id is refused by the database rather than matched to nobody;
  // either way there is no profile here, which is what the user page says too.
  const record = await new TeamProfilesService(supabase)
    .getTeamProfile(id)
    .catch(() => null);
  if (record === null) notFound();

  return <TeamProfileEditor record={record} editedByAdmin />;
}
