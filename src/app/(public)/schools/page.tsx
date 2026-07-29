import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { LocationsService } from "@/services/locations";
import { ProductsService } from "@/services/products";
import {
  buildMunicipalityEntries,
  SCHOOLS_COUNTRY_CODE,
  type MunicipalityEntry,
} from "@/lib/schools/municipalities";
import { SchoolsBrowse } from "@/components/public/schools/schools-browse";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("schools") };
}

/**
 * Server-prefetch everything the /schools page needs in one pass with the
 * viewer's RLS-scoped client (both `locations` and published `products` are
 * anon-readable): Finland's municipalities with their regions, and the visible
 * municipality clubs with the location each points at. We resolve each club to
 * its municipality and flag availability here, so the client component receives
 * a finished list and the whole page — intro, search, and rows — paints on the
 * first frame with no spinner and no layout shift (CLAUDE.md layout-stability
 * rule).
 *
 * Wrapped in try/catch with an empty fallback (mirroring `shop/page.tsx`): on
 * any failure the page still renders its intro + search over an empty list.
 */
async function getMunicipalityEntries(
  locale: string,
): Promise<MunicipalityEntry[]> {
  try {
    const supabase = await createClient();
    // A municipality counts as "has clubs" when it has a *visible*, non-ended
    // municipality club — deliberately NOT gated on registration being open
    // yet. Parents should discover a club as soon as it's listed and come back
    // when its registration window opens; `listVisibleByTypes` already drops
    // completed/expired clubs via effective status.
    const [municipalities, clubs] = await Promise.all([
      new LocationsService(supabase).getMunicipalitiesByCountry(
        SCHOOLS_COUNTRY_CODE,
      ),
      new ProductsService(supabase).listVisibleByTypes(["municipality_club"]),
    ]);
    return buildMunicipalityEntries(
      municipalities,
      clubs.map((c) => c.locations),
      locale,
    );
  } catch {
    return [];
  }
}

export default async function SchoolsPage() {
  const locale = await getLocale();
  const entries = await getMunicipalityEntries(locale);
  return <SchoolsBrowse entries={entries} />;
}
