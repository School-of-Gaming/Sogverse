import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { teamMemberPublicAddress } from "@/components/team/team-address";
import { TeamProfileEditor } from "@/components/team/team-profile-editor";
import { redirect } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { createClient, getUserWithProfile } from "@/lib/supabase/server";
// The service module, not the package index: the index re-exports the
// `"use client"` query hooks, which a Server Component would pull in as client
// references.
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";

/** Whether Postgres refused a value as malformed for its type — here, the id. */
function isInvalidTextRepresentation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "22P02"
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminTeamProfile") };
}

/**
 * `/admin/users/[id]/profile` — an admin editing another admin's or a
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

  const service = new TeamProfilesService(await createClient());
  // A malformed id is refused by the database (22P02) rather than matched to
  // nobody; either way there is no profile here. Any other failure is a
  // failed read, not a missing profile, and takes the page's error path.
  const record = await service
    .getTeamProfile(id)
    .catch((error: unknown) => {
      if (isInvalidTextRepresentation(error)) return null;
      throw error;
    });
  if (record === null) notFound();
  const publicAddress = await teamMemberPublicAddress(record, () =>
    service.listPublicTeamProfiles(),
  );

  return (
    <TeamProfileEditor
      record={record}
      publicAddress={publicAddress}
      editedByAdmin
    />
  );
}
