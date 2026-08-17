import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ProductsService } from "@/services/products";
import {
  ParticipationsService,
  type ParticipationCounts,
} from "@/services/participations";
import { UsersService } from "@/services/users";
import {
  buildMunicipalityEntries,
  findMunicipalityBySlug,
  municipalitiesOfClubs,
  selectClubsInMunicipality,
  type MunicipalityEntry,
} from "@/lib/schools/municipalities";
import { MunicipalityClubsBrowse } from "@/components/public/schools/municipality-clubs-browse";
import type { ProductBrowseRow, SpokenLanguage } from "@/types";

interface PageProps {
  params: Promise<{ municipalityName: string }>;
}

interface MunicipalityPageData {
  municipality: MunicipalityEntry;
  /** Every visible municipality club (seeds the client's cache; the component
   *  narrows to this municipality's). */
  allClubs: ProductBrowseRow[];
  /** Seat counts for this municipality's clubs only. */
  counts: ParticipationCounts[];
  spokenLanguages: SpokenLanguage[];
}

/**
 * Resolve the `/schools/<slug>` URL to its municipality and prefetch the page's
 * first frame, using the viewer's RLS-scoped client (published municipality
 * clubs are anon-readable).
 *
 * **This page reads no locations at all.** Every club's product row already
 * embeds the location it points at plus one level of parent, and the schema
 * allows exactly two shapes for a municipality club — the municipality itself
 * (online) or a site directly under it (in-person) — so the municipality node,
 * carrying its `id`, `name` and `name_i18n`, is always in flight already. That
 * node is everything this page needs: the display name, the canonical slug and
 * every alternate slug (so both `helsinki` and `helsingfors` land here). It
 * never renders the region, which is the one thing the embed cannot answer.
 *
 * The clubs and the seat counts are narrowed through the same
 * resolved-membership rule the /schools list uses, so both delivery modes land
 * here: an online club anchored at the municipality itself and an in-person one
 * anchored at a site inside it. Format is filtered separately, downstream.
 *
 * Returns `null` — the page 404s — when the slug matches none of the
 * club-bearing municipalities. That is one condition where there used to be
 * two: the entries are derived from the clubs, so a real municipality with no
 * clubs simply is not among them and misses exactly as a nonsense slug does.
 * The 404 surface is unchanged. A genuine fetch error is deliberately *not*
 * swallowed (unlike the /schools list's empty fallback): turning a transient DB
 * error into a 404 would mislead, so we let it surface to the error boundary.
 *
 * One accepted consequence of reading no locations: the club's country cannot
 * be checked, because the embed carries no `country_code`. A club anchored to a
 * non-Finnish municipality would therefore render here while staying absent
 * from /schools. On a detail route the club's existence is the authority — if a
 * club is running there, its page should render — and the picker only ever
 * offers Finnish municipalities, so this is reachable today only through legacy
 * rows the database trigger still permits.
 *
 * `cache()` dedupes the Supabase round-trips across `generateMetadata` and the
 * page render within a single request.
 */
const loadMunicipality = cache(
  async (slug: string, locale: string): Promise<MunicipalityPageData | null> => {
    const supabase = await createClient();
    // The spoken languages ride in this group rather than the next one: the
    // filter strip's language options depend on nothing the slug resolves to,
    // so waiting for the clubs would be a round trip spent on nothing.
    const [allClubs, spokenLanguages] = await Promise.all([
      new ProductsService(supabase).listVisibleByTypes(["municipality_club"]),
      new UsersService(supabase).getSpokenLanguages(),
    ]);

    const entries = buildMunicipalityEntries(
      municipalitiesOfClubs(allClubs),
      locale,
    );
    const municipality = findMunicipalityBySlug(slug, entries);
    if (!municipality) return null;

    // At least one club resolved to this municipality — that is how the entry
    // came to exist — so this can never come back empty.
    const muniClubs = selectClubsInMunicipality(allClubs, municipality.id);
    const counts = await new ParticipationsService(
      supabase,
    ).getParticipationCounts(muniClubs.map((c) => c.id));

    return { municipality, allClubs, counts, spokenLanguages };
  },
);

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { municipalityName } = await params;
  const locale = await getLocale();
  // Owner decision (Aug 2026): search engines and AI crawlers may discover
  // only the /shop browse surface — the entire /schools tree is noindex.
  const robots: Metadata["robots"] = { index: false, follow: false };
  const data = await loadMunicipality(municipalityName, locale);
  if (!data) return { robots };
  const t = await getTranslations("schools.municipality");
  return { title: t("heading", { name: data.municipality.name }), robots };
}

export default async function MunicipalityClubsPage({ params }: PageProps) {
  const { municipalityName } = await params;
  const locale = await getLocale();
  const data = await loadMunicipality(municipalityName, locale);
  if (!data) notFound();

  return (
    <MunicipalityClubsBrowse
      municipalityId={data.municipality.id}
      municipalitySlug={municipalityName}
      municipalityName={data.municipality.name}
      initialProducts={data.allClubs}
      initialCounts={data.counts}
      initialSpokenLanguages={data.spokenLanguages}
    />
  );
}
