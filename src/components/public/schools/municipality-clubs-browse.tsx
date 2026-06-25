"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";
import { MUNICIPALITY_TOPIC_CHIPS } from "@/lib/products/topics";
import { useVisibleProductsByTypes } from "@/services/products";
import {
  useParticipationCounts,
  type ParticipationCounts,
} from "@/services/participations";
import type { ProductBrowseRow, SpokenLanguage } from "@/types";
import { ProductBrowseResults } from "@/components/public/products/product-browse-results";

// The per-municipality clubs page (`/schools/<slug>`). A shop browse page
// narrowed to one municipality: same filter strip + card grid (via
// <ProductBrowseResults>), minus the Clubs|Camps Type row (everything here is a
// municipality club) and with the topic row generalised from games to every
// subject — coding and game design included.
//
// The page only renders for a municipality that runs clubs — the route 404s
// otherwise (see `[municipalityName]/page.tsx`) — so there's no bespoke empty
// state here; a transient client refetch returning nothing falls back to
// <ProductBrowseResults>'s generic empty card.
//
// `initialProducts` is *every* visible municipality club (the same set the
// /schools page fetches), so it seeds React Query's `["municipality_club"]`
// cache exactly and the client refetch is flicker-free. We narrow to this
// municipality's clubs client-side via `location_id`, mirroring how the shop
// narrows its all-types fetch down to the selected category.
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
  initialSpokenLanguages: SpokenLanguage[];
}

export function MunicipalityClubsBrowse({
  municipalityId,
  municipalitySlug,
  municipalityName,
  initialProducts,
  initialCounts,
  initialSpokenLanguages,
}: MunicipalityClubsBrowseProps) {
  const t = useTranslations("schools.municipality");

  const { data: allClubs } = useVisibleProductsByTypes(["municipality_club"], {
    initialData: initialProducts,
  });
  const clubs = useMemo(
    () => (allClubs ?? []).filter((p) => p.location_id === municipalityId),
    [allClubs, municipalityId],
  );

  const productIds = useMemo(() => clubs.map((p) => p.id), [clubs]);
  const { data: counts } = useParticipationCounts(productIds, {
    initialData: initialCounts,
  });

  return (
    <div className="container mx-auto px-4 py-8 sm:py-12">
      <header className="mx-auto max-w-3xl text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("heading", { name: municipalityName })}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          {t("subheading", { name: municipalityName })}
        </p>
      </header>

      <div className="mx-auto mt-8 max-w-6xl">
        <ProductBrowseResults
          products={clubs}
          counts={counts ?? []}
          // Municipality clubs are recurring-weekly, so the Days filter applies
          // (single source — also forwarded to the filter strip downstream).
          supportsDays
          filters={{
            initialSpokenLanguages,
            showTypeFilter: false,
            topicChoices: MUNICIPALITY_TOPIC_CHIPS,
            topicLabelKey: "subject",
          }}
          productHref={(id) =>
            ROUTES.schoolMunicipalityProduct(municipalitySlug, id)
          }
          municipalityScoped
        />
      </div>
    </div>
  );
}
