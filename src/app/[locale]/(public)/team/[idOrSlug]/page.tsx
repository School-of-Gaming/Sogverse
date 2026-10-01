import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";
import {
  findTeamMemberBySlug,
  teamMemberAddress,
} from "@/components/team/team-address";
import { teamMemberPlainName } from "@/components/team/team-name";
import { TeamProfileBody } from "@/components/team/team-profile-body";
import { TeamClosingCta } from "@/components/team/public/team-closing-cta";
import {
  teamMemberCanonicalPath,
  teamMemberJsonLd,
  teamMemberMetadata,
} from "@/components/team/public/team-member-metadata";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { resolveLocale } from "@/lib/constants/locales";
import { resolveIdOrSlug } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";
import { TeamProfilesService } from "@/services/team-profiles/team-profiles.service";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

interface PageProps {
  params: Promise<{ idOrSlug: string }>;
}

/**
 * The whole public team, in the read's own order — what a slug is matched
 * against and what decides who owns a slug two people derive. `cache()`
 * dedupes it across `generateMetadata` and the render within one request.
 */
const loadTeam = cache(async () =>
  new TeamProfilesService(await createClient()).listPublicTeamProfiles(),
);

/**
 * The public profile a segment names, or null: an id or a slug, each matched
 * against the public list — the one read a request makes, shared with the
 * canonical address. Anything not public — a hidden or unapproved profile,
 * someone not on the staff, a slug nobody derives — is null alike, and the
 * page answers it with a 404.
 */
const loadPerson = cache(async (segment: string) =>
  resolveIdOrSlug<TeamProfile>(segment, {
    byId: async (id) =>
      (await loadTeam()).find((person) => person.id === id) ?? null,
    bySlug: async (slug) => findTeamMemberBySlug(await loadTeam(), slug),
  }),
);

/** The person, their canonical address, and the words the page heads itself with. */
async function loadPage(segment: string) {
  const person = await loadPerson(segment);
  if (person === null) return null;
  const t = await getTranslations("team.profile");
  return {
    person,
    address: teamMemberAddress(await loadTeam(), person),
    name: teamMemberPlainName(person, t),
    jobTitle: person.kind === "admin" ? person.title : t("geduTitle"),
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const page = await loadPage((await params).idOrSlug);
  // The page answers not-found, and Next marks that response noindex itself.
  if (page === null) return {};
  return teamMemberMetadata({
    person: page.person,
    address: page.address,
    requestLocale: await getLocale(),
    name: page.name,
  });
}

/**
 * **One person's public profile** — an admin or a Gedu, at either of their
 * two addresses, neither redirecting: `/team/<id>` and `/team/<slug>`. Both
 * name the slug address as canonical (or the id, for someone whose slug is
 * taken by a person listed before them).
 *
 * The body is the profile body the editor previews, so what the person saw
 * while writing is what the public reads; around it, the way back to the
 * whole team and the closing call to action.
 *
 * Rendered per request, like the Library: a profile goes live, changes or
 * leaves the moment an admin or the person saves, with no revalidation to
 * wait out. A read that fails surfaces to the error boundary rather than
 * answering not-found for someone who is there.
 */
export default async function TeamMemberPage({ params }: PageProps) {
  const page = await loadPage((await params).idOrSlug);
  if (page === null) notFound();
  const locale = resolveLocale(await getLocale());
  const t = await getTranslations("team.public");

  return (
    <>
      <JsonLd
        data={teamMemberJsonLd({
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
          canonicalPath: teamMemberCanonicalPath(page.person, page.address, locale),
          person: page.person,
          jobTitle: page.jobTitle,
          locale,
        })}
      />
      <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6 sm:pt-8">
        <Link
          href={ROUTES.team}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          {t("back")}
        </Link>
      </div>
      <TeamProfileBody profile={page.person} />
      <div className="container mx-auto px-4 pb-14 sm:pb-20">
        <TeamClosingCta className="mt-4" />
      </div>
    </>
  );
}
