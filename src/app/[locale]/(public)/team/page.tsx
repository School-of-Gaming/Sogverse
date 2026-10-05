import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { teamMemberAddress } from "@/components/team/team-address";
import { TeamIndexBody } from "@/components/team/public/team-index-body";
import { ROUTES } from "@/lib/constants";
import { localizedPageMetadata } from "@/lib/metadata/localized-page";
import { createClient } from "@/lib/supabase/server";
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    ...(await localizedPageMetadata("/team", await getLocale())),
    title: t("pages.team"),
    description: t("descriptions.team"),
  };
}

/**
 * **The Team index — every public profile, leadership first, then the Game
 * Educators.** Public and promoted.
 *
 * Rendered per request, like the Library, on the request's server client (the
 * public read works signed out): a profile shows the moment an admin makes it
 * public and goes the moment it is hidden, with no revalidation to wait out.
 * Its photo follows within the photo route's five-minute cache. A read that
 * fails surfaces to the error boundary rather than painting an empty team.
 *
 * Each card links to the person's canonical address, which is judged against
 * this same list: two people deriving one slug leave the second on their id.
 */
export default async function TeamIndexPage() {
  const team = await new TeamProfilesService(
    await createClient(),
  ).listPublicTeamProfiles();

  return (
    <TeamIndexBody
      members={team.map((profile) => ({
        profile,
        href: ROUTES.teamMember(teamMemberAddress(team, profile)),
      }))}
    />
  );
}
