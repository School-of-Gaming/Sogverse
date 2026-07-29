import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { LocationsService } from "@/services/locations";
import {
  buildMunicipalityEntries,
  findMunicipalityBySlug,
  SCHOOLS_COUNTRY_CODE,
} from "@/lib/schools/municipalities";
import { ProductDetailPage } from "@/components/public/products/product-detail-page";

interface PageProps {
  params: Promise<{ municipalityName: string; id: string }>;
}

// A municipality club's detail page, reached from its `/schools/<slug>` listing.
// Renders the same detail UI as `/shop/[id]`, but server-resolves the slug to
// its municipality name so the back link can return to that listing (labelled
// with the municipality) instead of the storefront. The product itself is
// fetched client-side by <ProductDetailPage>, exactly as on `/shop/[id]`.
//
// We resolve the slug for the back link only — we don't gate the product on
// belonging to this municipality. The slug determines "where back goes", and
// normal navigation always pairs the right slug with the right club; a
// hand-crafted mismatch just shows the club with a back link to the slug's
// listing, which is harmless. An unknown municipality slug 404s, mirroring the
// listing page.
export default async function MunicipalityClubDetailPage({ params }: PageProps) {
  const { municipalityName, id } = await params;
  const locale = await getLocale();

  const supabase = await createClient();
  const municipalities = await new LocationsService(
    supabase,
  ).getMunicipalitiesByCountry(SCHOOLS_COUNTRY_CODE);
  // `[]` for club locations — we only need the slug→name/region mapping here,
  // not the `hasClubs` flag the listing page computes.
  const entries = buildMunicipalityEntries(municipalities, [], locale);
  const municipality = findMunicipalityBySlug(municipalityName, entries);
  if (!municipality) notFound();

  return (
    <ProductDetailPage
      productId={id}
      municipality={{ slug: municipalityName, name: municipality.name }}
    />
  );
}
