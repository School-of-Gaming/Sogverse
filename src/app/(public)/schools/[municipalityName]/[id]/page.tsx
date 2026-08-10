import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createAnonClient } from "@/lib/supabase/anon";
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

/**
 * Robots policy for one municipality club page — the same rule `/shop/[id]`
 * applies, and it has to be applied here too because this is a **second URL for
 * the same product**. A muni club reached through its `/schools/<slug>/` path is
 * the identical row; without this the noindex on the shop URL was simply
 * side-stepped, and an unlisted club stayed indexable through the schools route.
 *
 * `is_visible` means "listed": an unlisted product is deliberately readable and
 * purchasable by direct link, and the one thing that must not happen is the link
 * turning up in search results and making it listed after all. So an unlisted
 * product serves noindex/nofollow and a listed one keeps the site-wide default.
 * A row we cannot read gets noindex too — the page renders a not-found state,
 * and an unknown municipality slug 404s below regardless.
 *
 * Cookie-free anon client, as on `/shop/[id]`: `is_visible` is a column on the
 * product rather than a fact about the viewer, so the read is identity-free
 * (see the client's doc — no caching win today; the page body below reads
 * cookies anyway). Only `data` is consulted, so a transient query error is
 * indistinguishable from a missing row and both land on noindex — deliberately
 * fail-closed: a wrongly-noindexed listed page heals on the next crawl, while
 * an indexed unlisted one is the harm this tag exists to prevent.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = createAnonClient();
  const { data } = await supabase
    .from("products")
    .select("is_visible")
    .eq("id", id)
    .maybeSingle();

  if (data?.is_visible === true) return {};
  return { robots: { index: false, follow: false } };
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
