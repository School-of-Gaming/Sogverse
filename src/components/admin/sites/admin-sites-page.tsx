"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NavChevron } from "@/components/ui/nav-chevron";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ROUTES } from "@/lib/constants";
import { localizedLocationName } from "@/lib/locations/localized-name";
import {
  LOCATION_SEARCH_MAX_QUERY,
  LOCATION_SEARCH_MIN_QUERY,
  useLocationSearch,
  useSitesPages,
} from "@/services/locations";
import { useSiteProductCounts } from "@/services/sites";
import type { Json, LocationType } from "@/types";
import { sitePlacePath, type PlacePathNode } from "./site-place-path";

/**
 * The one level this page deals in. A constant rather than an inline array so
 * the search hook's cache key is stable across renders — a fresh array literal
 * every render is a fresh key every render.
 */
const SITE_LEVEL: readonly LocationType[] = ["site"];

/** What the table renders, whichever read produced the row. */
interface SiteRow {
  id: string;
  name: string;
  name_i18n: Json | null;
  /** The ancestor chain, **nearest first**, exactly as both reads return it. */
  ancestors: PlacePathNode[];
}

/**
 * Every site on the platform: a searchable, paged table of the venue rows an
 * admin has created, each linking to its own page.
 *
 * **Two reads answer the same table, and which one is showing is decided by the
 * box alone.** An empty box lists the sites a page at a time, ordered by name;
 * a needle past the minimum length hands the question to the search index,
 * filtered to the `site` level — the same ranked, capped, server-side query the
 * venue picker asks, so a site found here and a site found there are the same
 * row with the same chain. Clearing the box drops back to the listing, which is
 * the picker's grammar and is why there is no mode switch to operate.
 *
 * **No loading affordance anywhere.** Every read behind this page is a small
 * indexed lookup — one page of one type by name, a capped top-N from the search
 * index, one tally over the ids already on screen — so each lands in a frame or
 * two. The chrome, the search box and the column headers are on screen from the
 * first frame and the rows fill in beneath them.
 */
export function AdminSitesPage() {
  const t = useTranslations("admin.sites");
  const locale = useLocale();

  const [query, setQuery] = useState("");
  // The value lags, never the input: what the admin sees updates on every
  // keystroke and only the request waits.
  const needle = useDebouncedValue(query.trim());
  const searching = needle.length >= LOCATION_SEARCH_MIN_QUERY;

  const listing = useSitesPages();
  const search = useLocationSearch(needle, { types: SITE_LEVEL });

  const rows = useMemo<SiteRow[]>(() => {
    if (searching) {
      return (search.data?.results ?? []).map((hit) => ({
        id: hit.id,
        name: hit.name,
        name_i18n: hit.name_i18n,
        ancestors: hit.ancestors,
      }));
    }
    return (listing.data?.pages ?? []).flatMap((page) =>
      page.rows.map((row) => ({
        id: row.id,
        name: row.name,
        name_i18n: row.name_i18n,
        ancestors: row.ancestors,
      })),
    );
  }, [searching, search.data, listing.data]);

  // Bounded by what is on screen rather than by the table: the ids are the ones
  // this render is about to paint, so a "show more" simply asks a wider
  // question under a new cache key.
  const siteIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const counts = useSiteProductCounts(siteIds);

  // The search index caps its page and reports the true match count, so a full
  // page of hits and a complete answer are indistinguishable without this.
  const capped =
    searching &&
    search.data !== undefined &&
    search.data.total > search.data.results.length
      ? { shown: search.data.results.length, total: search.data.total }
      : null;

  const total = listing.data?.pages[0]?.total;
  const settled = searching ? !search.isPending : !listing.isPending;

  return (
    // The listing can shrink back above the fold as a search narrows it, so the
    // document scrollbar's gutter is reserved rather than left to appear and
    // shift the page sideways.
    <div className="mx-auto max-w-6xl space-y-6" data-reserve-scroll-gutter>
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchAriaLabel")}
              // The route refuses a longer needle outright, which would leave
              // the results area dead rather than showing "no matches".
              maxLength={LOCATION_SEARCH_MAX_QUERY}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* A table stays a table on an admin surface; below the design floor
              it scrolls inside its own container rather than the document. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("columnSite")}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    {t("columnPlace")}
                  </th>
                  {/* Fixed width, and it is load-bearing: the tally is a second
                      read that lands after the rows, so this column is empty on
                      the first paint and filled on a later one. Pinning the
                      width means the number arrives into a column that is
                      already the size it will be, and the two columns beside it
                      never move. */}
                  <th
                    scope="col"
                    className="w-28 px-3 py-2 text-right font-medium"
                  >
                    {t("columnProducts")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="group border-b border-border last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={ROUTES.admin.site(row.id)}
                        className="flex items-center gap-1 rounded font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="truncate">
                          {localizedLocationName(row, locale)}
                        </span>
                        <NavChevron size="sm" />
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {sitePlacePath(row.ancestors, locale)}
                    </td>
                    <td className="w-28 px-3 py-2 text-right tabular-nums">
                      {counts.data?.[row.id]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {settled && rows.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {searching ? t("noResults", { query: needle }) : t("empty")}
            </p>
          )}

          {/* Everything below the table appends beneath rows already painted,
              so it costs nothing already on screen when it arrives. */}
          {capped && (
            <p className="pt-4 text-center text-sm text-muted-foreground">
              {t("searchCapped", capped)}
            </p>
          )}

          {!searching && total !== undefined && (
            <div className="flex flex-col items-center gap-3 pt-4">
              <p className="text-sm text-muted-foreground">
                {t("countAll", { count: total })}
              </p>
              {listing.hasNextPage && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={listing.isFetchingNextPage}
                  onClick={() => void listing.fetchNextPage()}
                >
                  {t("loadMore")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
