"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES, SUPPORT_EMAIL } from "@/lib/constants";
import { MUNICIPALITY_BROWSE_TOPICS } from "@/lib/products/topics";
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
  /** Display name in the viewer's locale, for the heading + empty-state copy. */
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
  const countsByProduct = useMemo(() => {
    const map = new Map<string, ParticipationCounts>();
    for (const c of counts ?? []) {
      map.set(c.productId, c);
    }
    return map;
  }, [counts]);

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
        {clubs.length === 0 ? (
          <MunicipalityEmptyState name={municipalityName} />
        ) : (
          <ProductBrowseResults
            products={clubs}
            countsByProduct={countsByProduct}
            supportsDays
            filters={{
              initialSpokenLanguages,
              showTypeFilter: false,
              topicChoices: MUNICIPALITY_BROWSE_TOPICS,
              topicLabelKey: "subject",
              daysFilter: true,
            }}
            productHref={(id) =>
              ROUTES.schoolMunicipalityProduct(municipalitySlug, id)
            }
          />
        )}
      </div>
    </div>
  );
}

// Reached when a parent direct-links to a municipality we don't run clubs in
// yet (the /schools list keeps those rows non-clickable). No "coming soon"
// promise — we don't know if or when — just an honest nudge to ask for it,
// plus a route to the clubs anyone can join from home.
function MunicipalityEmptyState({ name }: { name: string }) {
  const t = useTranslations("schools.municipality.empty");
  const c = useTranslations("common");
  return (
    <Card>
      <CardContent className="mx-auto max-w-prose space-y-4 py-12 text-center">
        <p className="text-base font-semibold">{t("title", { name })}</p>
        <p className="text-sm text-muted-foreground">
          {t("body", { name })}{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-primary hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="text-sm text-muted-foreground">{t("openClubs")}</p>
        <Link href={ROUTES.shop} className={buttonVariants({ size: "sm" })}>
          {c("exploreClubs")}
        </Link>
      </CardContent>
    </Card>
  );
}
