import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TeamProfileEditor } from "@/components/team/team-profile-editor";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
// The service module, not the package index: the index re-exports the
// `"use client"` query hooks, which a Server Component would pull in as client
// references.
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("teamProfile") };
}

/**
 * `/settings/team-profile` — an admin or a Gedu editing their own public
 * profile.
 *
 * The proxy lets every signed-in role into `/settings`, so the role test is
 * here: a parent or a gamer has no team profile, and the page does not exist
 * for them. The role comes from the verified session's profile, never from
 * request input; the record read is the viewer's own, under RLS.
 *
 * The record is read before the first byte, because the whole form opens on
 * it: a form that painted empty and then filled in would move every field
 * under the reader.
 */
export default async function TeamProfileSettingsPage() {
  const viewer = await getUserWithProfile();
  const role = viewer?.profile?.role;
  if (!viewer || (role !== "admin" && role !== "gedu")) notFound();

  const supabase = await createClient();
  const record = await new TeamProfilesService(supabase).getTeamProfile(
    viewer.user.id,
  );
  if (record === null) notFound();

  return <TeamProfileEditor record={record} />;
}
