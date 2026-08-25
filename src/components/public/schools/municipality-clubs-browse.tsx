"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { selectClubsInMunicipality } from "@/lib/schools/municipalities";
import { useVisibleProductsByTypes } from "@/services/products";
import {
  useParticipationCounts,
  type ParticipationCounts,
} from "@/services/participations";
import type { ProductBrowseRow } from "@/types";
import { ProductBrowseResults } from "@/components/public/products/product-browse-results";

// The per-municipality clubs page (`/schools/<slug>`). A shop browse page
// narrowed to one municipality: same filters + card grid (via
// <ProductBrowseResults>), minus the Clubs|Camps Type row — everything here is
// a municipality club. One unheaded section, so the grid reads as a plain grid
// under this page's own h1 rather than repeating "Clubs" beneath it.
//
// The page only renders for a municipality that runs clubs — the route 404s
// otherwise (see `[municipalityName]/page.tsx`) — so there's no bespoke empty
// state here; a transient client refetch returning nothing falls back to
// <ProductBrowseResults>'s generic empty card.
//
// `initialProducts` is *every* visible municipality club (the same set the
// /schools page fetches), so it seeds React Query's `["municipality_club"]`
// cache exactly and the client refetch is flicker-free. Narrowing to this
// municipality happens client-side through the shared resolved-membership
// helper — the same rule the server prefetch and the /schools list use, so all
// three agree. It has to be a resolution rather than a `location_id` match:
// this municipality's clubs are anchored at two levels (the municipality itself
// when online, a site inside it when in-person), and an equality test would
// keep only the online ones. Delivery mode is filtered separately, by the
// filter strip's Format row.
interface MunicipalityClubsBrowseProps {
  municipalityId: string;
  /** The slug the user is on (the URL param), used to build child detail-page
   *  URLs so they stay in this municipality's namespace. */
  municipalitySlug: string;
  /** Display name in the viewer's locale, for the heading copy. */
  municipalityName: string;
  /** Every visible municipality club (server-prefetched), not just this one's. */
  initialProducts: ProductBrowseRow[];
  /** Seat counts for *this* municipality's clubs (server-prefetched). */
  initialCounts: ParticipationCounts[];
}

export function MunicipalityClubsBrowse({
  municipalityId,
  municipalitySlug,
  municipalityName,
  initialProducts,
  initialCounts,
}: MunicipalityClubsBrowseProps) {
  const t = useTranslations("schools.municipality");

  const { data: allClubs } = useVisibleProductsByTypes(["municipality_club"], {
    initialData: initialProducts,
  });
  const clubs = useMemo(
    () => selectClubsInMunicipality(allClubs ?? [], municipalityId),
    [allClubs, municipalityId],
  );

  const productIds = useMemo(() => clubs.map((p) => p.id), [clubs]);
  const { data: counts } = useParticipationCounts(productIds, {
    initialData: initialCounts,
  });

  const sections = useMemo(
    () => [{ id: "municipality-clubs", products: clubs }],
    [clubs],
  );

  return (
    <div className="py-8 sm:py-12">
      {/* The heading stays a centred reading column while the results below
          break out of it from `lg` up (see <ProductBrowseResults>). Both are
          centred on the viewport and the heading is narrower than the cards'
          64rem cap, so it reads as a title over the cards rather than as a
          second, unrelated width — exactly aligned once the cards' gutters
          equalise (~1616px), and up to ~128px left of the cards' centre below
          that, the same tolerance the results grid accepts and documents. */}
      <header className="mx-auto max-w-3xl px-4 text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("heading", { name: municipalityName })}
        </h1>
      </header>

      <div className="mt-8">
        <ProductBrowseResults
          sections={sections}
          counts={counts ?? []}
          showTypeFilter={false}
          productHref={(id) =>
            ROUTES.schoolMunicipalityProduct(municipalitySlug, id)
          }
          municipalityScoped
        />
      </div>
    </div>
  );
}
