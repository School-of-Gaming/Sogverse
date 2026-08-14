import type { Metadata, ResolvingMetadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { buildProductMetadata } from "@/lib/products/product-metadata";
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

/**
 * Robots policy: **noindex, unconditionally** — the same owner decision as
 * `/shop/[id]`, and the Open Graph card that route builds — both from the one
 * shared builder.
 *
 * The reason is the same for both halves, and is why they are shared rather
 * than restated: this is a **second URL for the same product row**. A robots
 * rule only one of the two URLs carried could be side-stepped by sharing the
 * other; a card only one of them built would leave a municipality club — the
 * shape most likely to be pasted into a school's parent group — unfurling as
 * the generic site-wide preview. Whatever one URL says about a product, both
 * say.
 *
 * The municipality slug deliberately plays no part in it. It decides where the
 * back link returns to, not which product this is, and two URLs onto one row
 * must not describe that row differently.
 */
export async function generateMetadata(
  { params }: PageProps,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const { id } = await params;
  return buildProductMetadata(id, parent);
}

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
