import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { LocationsService } from "@/services/locations";
import { ProductsService } from "@/services/products";
import {
  buildMunicipalityEntries,
  municipalitiesOfClubs,
  SCHOOLS_COUNTRY_CODE,
  type MunicipalityEntry,
} from "@/lib/schools/municipalities";
import { SchoolsBrowse } from "@/components/public/schools/schools-browse";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  // Owner decision (Aug 2026): search engines and AI crawlers may discover
  // only the /shop browse surface — the entire /schools tree is noindex.
  return { title: t("schools"), robots: { index: false, follow: false } };
}

/**
 * Server-prefetch the list of municipalities this page browses, with the
 * viewer's RLS-scoped client (both `products` and `locations` are
 * anon-readable), so the client component receives a finished list and the
 * whole page — intro, search, and rows — paints on the first frame with no
 * spinner and no layout shift (CLAUDE.md layout-stability rule).
 *
 * **Clubs first, geography second, in two phases.** A municipality is listed
 * when it has a *visible*, non-ended municipality club — deliberately NOT gated
 * on registration being open yet, so parents can discover a club as soon as it
 * is listed and come back when its registration window opens. So the clubs are
 * the bound: read them, resolve each up to its municipality, and then read
 * exactly those municipalities by key. Both reads are O(clubs); neither is O(a
 * country). The second phase is what the first cannot answer — an in-person
 * club's location embed stops at the municipality, and this page groups by
 * region, which only the ancestor chain carries.
 *
 * The keyed read is deliberately unfiltered (a stored pick must keep
 * resolving), so the narrowing to Finnish municipality rows happens here in
 * memory over `type` and `country_code`, which the read already returns. One
 * accepted consequence: a club anchored to a *retired* municipality now
 * appears. It is a real club, already visible in /shop, and hiding it would
 * mean a family cannot find a club they may be enrolled in.
 *
 * Wrapped in try/catch with an empty fallback (mirroring `shop/page.tsx`): on
 * any failure the page still renders its intro + search over an empty list.
 */
async function getMunicipalityEntries(
  locale: string,
): Promise<MunicipalityEntry[]> {
  try {
    const supabase = await createClient();
    const clubs = await new ProductsService(
      supabase,
    ).listVisibleLocationsByTypes(["municipality_club"]);

    const municipalityIds = municipalitiesOfClubs(clubs).map((m) => m.id);
    const rows = await new LocationsService(supabase).getLocationsByIds(
      municipalityIds,
    );

    return buildMunicipalityEntries(
      rows.filter(
        (r) =>
          r.type === "municipality" &&
          r.country_code === SCHOOLS_COUNTRY_CODE,
      ),
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
