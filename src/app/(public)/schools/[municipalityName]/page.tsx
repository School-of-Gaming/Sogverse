import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { LocationsService } from "@/services/locations";
import { ProductsService } from "@/services/products";
import {
  ParticipationsService,
  type ParticipationCounts,
} from "@/services/participations";
import { UsersService } from "@/services/users";
import {
  buildMunicipalityEntries,
  findMunicipalityBySlug,
  SCHOOLS_COUNTRY_CODE,
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
 * first frame, using the viewer's RLS-scoped client (locations + published
 * municipality clubs are both anon-readable). We fetch the same two scoped sets
 * the /schools list does, resolve the slug against every locale's name (so both
 * `helsinki` and `helsingfors` land here), and narrow the clubs + their seat
 * counts to this municipality.
 *
 * Returns `null` — the page 404s — when the slug matches no real Finnish
 * municipality *or* when that municipality runs no clubs. The /schools list
 * only links municipalities that have clubs, so a clubless municipality page is
 * reachable only by a hand-typed URL; we'd rather 404 than serve an empty
 * shell. A genuine fetch error is deliberately *not* swallowed (unlike the
 * /schools list's empty fallback): turning a transient DB error into a 404
 * would mislead, so we let it surface to the error boundary instead.
 *
 * `cache()` dedupes the two Supabase round-trips across `generateMetadata` and
 * the page render within a single request.
 */
const loadMunicipality = cache(
  async (slug: string, locale: string): Promise<MunicipalityPageData | null> => {
    const supabase = await createClient();
    const [municipalities, allClubs] = await Promise.all([
      new LocationsService(supabase).getMunicipalitiesByCountry(
        SCHOOLS_COUNTRY_CODE,
      ),
      new ProductsService(supabase).listVisibleByTypes(["municipality_club"]),
    ]);

    const entries = buildMunicipalityEntries(
      municipalities,
      allClubs.map((c) => c.locations),
      locale,
    );
    const municipality = findMunicipalityBySlug(slug, entries);
    if (!municipality) return null;

    const muniClubs = allClubs.filter(
      (c) => c.location_id === municipality.id,
    );
    if (muniClubs.length === 0) return null;

    const [counts, spokenLanguages] = await Promise.all([
      new ParticipationsService(supabase).getParticipationCounts(
        muniClubs.map((c) => c.id),
      ),
      new UsersService(supabase).getSpokenLanguages(),
    ]);

    return { municipality, allClubs, counts, spokenLanguages };
  },
);

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { municipalityName } = await params;
  const locale = await getLocale();
  const data = await loadMunicipality(municipalityName, locale);
  if (!data) return {};
  const t = await getTranslations("schools.municipality");
  return { title: t("heading", { name: data.municipality.name }) };
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
