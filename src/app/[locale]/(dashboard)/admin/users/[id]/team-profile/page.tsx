import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdminGeduTeamProfileEditor } from "@/components/team/team-profile-editor";
import { createClient } from "@/lib/supabase/server";
// The service module, not the package index: the index re-exports the
// `"use client"` query hooks, which a Server Component would pull in as client
// references.
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminTeamProfile") };
}

/**
 * `/admin/users/[id]/team-profile` — an admin editing a Gedu's profile
 * content. The proxy gates `/admin` to admins.
 *
 * Only a Gedu's profile is edited here. An admin's profile is theirs to write
 * from their own settings, so another admin's page, like any role without a
 * profile, is not found.
 */
export default async function AdminUserTeamProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  // A malformed id is refused by the database rather than matched to nobody;
  // either way there is no Gedu here, which is what the user page says too.
  const record = await new TeamProfilesService(supabase)
    .getTeamProfile(id)
    .catch(() => null);
  if (record?.role !== "gedu") notFound();

  return <AdminGeduTeamProfileEditor record={record} />;
}
