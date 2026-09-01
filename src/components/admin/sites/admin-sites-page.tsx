"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NavChevron } from "@/components/ui/nav-chevron";
import { SitePickerDialog } from "@/components/admin/products/site-picker-dialog";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ROUTES } from "@/lib/constants";
import { localizedLocationName } from "@/lib/locations/localized-name";
import {
  LOCATION_SEARCH_MAX_QUERY,
  LOCATION_SEARCH_MIN_QUERY,
  useAllSites,
  useLocationSearch,
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
 * Every site on the platform: a searchable table of the site rows an admin has
 * created, each row opening its own page.
 *
 * **The listing is the whole level, and there is nothing to page through.** The
 * read walks its pages server-side and hands back every site; this table renders
 * every row it is handed. That is the same legitimacy the per-municipality site
 * list has, one scope wider — a page showing its content rather than a control
 * choosing from a collection — so there is no "show more" and no total printed
 * beside a list that is already complete. The one count on this page is the
 * *search* one, which says something a complete list cannot: the index caps its
 * answer, so "showing N of M" is the only thing separating a full page of hits
 * from every hit there is.
 *
 * **Two reads answer the same table, and which one is showing is decided by the
 * box alone.** An empty box lists every site, ordered by name; a needle past the
 * minimum length hands the question to the search index, filtered to the `site`
 * level — the same ranked, capped, server-side query the site picker asks, so a
 * site found here and a site found there are the same row with the same chain.
 * Clearing the box drops back to the listing, which is the picker's grammar and
 * is why there is no mode switch to operate.
 *
 * **No loading affordance anywhere.** Sites are the one level of the tree this
 * application creates, so the listing is tens of rows rather than the tens of
 * thousands a seeded level runs to, and the search and tally beside it are a
 * capped top-N and one indexed aggregate. Each lands in a frame or two. The
 * chrome, the search box and the column headers are on screen from the first
 * frame and the rows fill in beneath them. If this level ever grows past what a
 * screen can hold, that is the decision to revisit — not the walk.
 */
export function AdminSitesPage() {
  const t = useTranslations("admin.sites");
  const locale = useLocale();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  // The value lags, never the input: what the admin sees updates on every
  // keystroke and only the request waits.
  const needle = useDebouncedValue(query.trim());
  const searching = needle.length >= LOCATION_SEARCH_MIN_QUERY;

  const listing = useAllSites();
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
    return (listing.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      name_i18n: row.name_i18n,
      ancestors: row.ancestors,
    }));
  }, [searching, search.data, listing.data]);

  // Every site, not the rows on screen: the listing already holds the whole
  // level, and search hits are a subset of it, so one tally answers both
  // branches and the column never reloads when the box is typed into.
  const siteIds = useMemo(
    () => (listing.data ?? []).map((row) => row.id),
    [listing.data],
  );
  const counts = useSiteProductCounts(siteIds);

  // The search index caps its page and reports the true match count, so a full
  // page of hits and a complete answer are indistinguishable without this.
  const capped =
    searching &&
    search.data !== undefined &&
    search.data.total > search.data.results.length
      ? { shown: search.data.results.length, total: search.data.total }
      : null;

  const settled = searching ? !search.isPending : !listing.isPending;

  return (
    // The listing can shrink back above the fold as a search narrows it, so the
    // document scrollbar's gutter is reserved rather than left to appear and
    // shift the page sideways.
    <div className="mx-auto max-w-6xl space-y-6" data-reserve-scroll-gutter>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button
          type="button"
          className="gap-1.5"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-4 w-4" />
          {t("addSite")}
        </Button>
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
                  {/* The chevron's column. Deliberately unlabelled: it holds a
                      decorative mark rather than data, and its header is what a
                      screen reader would otherwise announce before every
                      cell. */}
                  <th scope="col" className="w-8 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  /*
                   * The whole row opens the site, as one real link.
                   *
                   * `relative` is what the name link's `::after` is positioned
                   * against, so a single anchor covers every cell — the
                   * stretched-link shape the browse and assignment cards use,
                   * with the row's own text as the anchor rather than an empty
                   * one. That is what keeps the accessible name the site's name
                   * with nothing to duplicate it, and puts the focus ring
                   * around words a keyboard user can read. `group` is what the
                   * chevron's nudge reads, on hover and on focus alike.
                   */
                  <tr
                    key={row.id}
                    className="group relative border-b border-border transition-colors last:border-b-0 hover:bg-accent focus-within:bg-accent"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={ROUTES.admin.site(row.id)}
                        className="rounded font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {localizedLocationName(row, locale)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {sitePlacePath(row.ancestors, locale)}
                    </td>
                    <td className="w-28 px-3 py-2 text-right tabular-nums">
                      {counts.data?.[row.id]}
                    </td>
                    <td className="w-8 px-3 py-2">
                      <NavChevron size="sm" />
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

          {/* Appended beneath rows already painted, so it costs nothing already
              on screen when it arrives. */}
          {capped && (
            <p className="pt-4 text-center text-sm text-muted-foreground">
              {t("searchCapped", capped)}
            </p>
          )}
        </CardContent>
      </Card>

      {/*
       * Creating a site is the product form's dialog, unchanged and unbound to
       * any country: browse or search to the municipality, name the building,
       * and land on the page for it. Picking one that already exists goes to the
       * same place, which is what makes this one affordance rather than two —
       * "add a site" and "find a site" are the same question until the answer
       * turns out not to exist yet.
       *
       * The new row reaches the table without this knowing: creation invalidates
       * the sites grouping key, and the all-sites read hangs under it.
       */}
      <SitePickerDialog
        open={adding}
        onOpenChange={setAdding}
        onPick={(siteId) => {
          setAdding(false);
          router.push(ROUTES.admin.site(siteId));
        }}
      />
    </div>
  );
}
