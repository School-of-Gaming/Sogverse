"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  LOCATION_SEARCH_MIN_QUERY,
  useLocationChildren,
  useLocationSearch,
} from "@/services/locations";
import type { Location, LocationType } from "@/types";
import {
  LocationPickerPanel,
  LocationPickerShell,
  type LocationChainSummary,
  type LocationPick,
  type LocationSelection,
} from "./location-picker-panel";

/**
 * The data half of the location picker: browse position, debounced query, and
 * the two server reads behind them. The panel it renders holds none of this,
 * which is what keeps the panel demoable from fixtures.
 *
 * Both reads are small and indexed — one level of children by `parent_id`, or a
 * capped top-N from the search index — so neither gets a loading affordance.
 * The panel's list box already has its final height; it simply fills in.
 *
 * ## Paging
 *
 * A level is fetched a page at a time and pages accumulate behind a "load more"
 * button rather than being replaced. Most levels are one page (a country has
 * tens of regions, a French département a few hundred communes), but the payload
 * has to stay proportional to the screen rather than to the fan-out, because
 * nothing stops a future country from having thousands of children at one level.
 *
 * ## Starting somewhere other than the root
 *
 * A caller that already knows which country it is asking about can hand over a
 * breadcrumb to open on. It is a *starting position*, not a floor: the
 * breadcrumb's root entry still walks back up, because a picker that traps the
 * user below a node they can see named above them is worse than one that opens
 * a level higher. The seed is applied by *derivation* rather than by an effect
 * — the path is whatever the user has navigated to, falling back to the seed
 * until they navigate at all — so a seed that arrives late cannot yank someone
 * out of a level they already opened, and a seed that never arrives simply
 * leaves the picker at the root.
 *
 * ## Restricting to one country
 *
 * `countryCode` is a caller's business rule (a municipality club is funded by a
 * Finnish kunta and by nothing else), applied to *every* row this container
 * hands the panel — browsed or searched — so the restriction is "not offered"
 * rather than "refused afterwards". Its honest limitation is in the search
 * half: the server ranks and caps the page **before** this filter runs, so a
 * needle matching many rows in other countries can push the wanted ones off the
 * page entirely, and the "showing N of M" total is the true cross-country match
 * count rather than the count of rows this picker would offer. That direction
 * is the safe one — the number is never lower than the truth, so it can only
 * over-prompt an admin to narrow their needle, never claim a complete list —
 * but it is not the number a reader would assume. Closing the gap properly
 * means a country parameter on the search function itself; browsing, which is
 * exhaustive at every level, is unaffected.
 */

/** Stable identity for "no seed", so the derived path does not churn. */
const NO_PATH: readonly LocationChainSummary[] = [];

/** Whether a row belongs to the country a caller restricted the picker to. */
function inCountry(
  row: { country_code: string | null },
  countryCode: string | undefined,
): boolean {
  return countryCode === undefined || row.country_code === countryCode;
}

interface LocationBrowserProps {
  selection: LocationSelection;
  /** Restrict search hits to these types. Browsing always shows every level. */
  searchTypes?: readonly LocationType[];
  /**
   * The breadcrumb to open on, root first, until the user navigates. Absent (or
   * empty) opens at the top of the tree.
   */
  initialPath?: readonly LocationChainSummary[];
  /** Offer only rows in this country, browsing and searching alike. */
  countryCode?: string;
}

export function LocationBrowser({
  selection,
  searchTypes,
  initialPath,
  countryCode,
}: LocationBrowserProps) {
  /**
   * Where the user has navigated to, root first — `null` until they navigate at
   * all, which is what lets the seed below win without an effect and lose to
   * any click that came first. `[]` is a real answer here ("they went back to
   * the top"), and is deliberately not the same value as `null`.
   */
  const [userPath, setUserPath] = useState<readonly LocationChainSummary[] | null>(
    null,
  );
  const [query, setQuery] = useState("");

  const path = useMemo(
    () => userPath ?? initialPath ?? NO_PATH,
    [userPath, initialPath],
  );

  const debounced = useDebouncedValue(query);
  const parentId = path.at(-1)?.id ?? null;

  const level = useLocationChildren(parentId);
  const search = useLocationSearch(debounced, { types: searchTypes });

  const browseRows = useMemo<LocationPick[]>(() => {
    // The ancestors of a browsed row are exactly the breadcrumb, reversed:
    // nearest first, matching what search returns, so a pick is one shape
    // whichever way the user found it.
    const ancestors = [...path].reverse();
    return (level.data?.pages ?? [])
      .flatMap((page) => page.rows)
      .filter((row: Location) => inCountry(row, countryCode))
      .map((row: Location) => ({ location: row, ancestors }));
  }, [level.data, path, countryCode]);

  const searchRows = useMemo<LocationPick[]>(
    () =>
      (search.data?.results ?? [])
        .filter((hit) => inCountry(hit, countryCode))
        .map((hit) => ({
          location: hit,
          ancestors: hit.ancestors,
        })),
    [search.data, countryCode],
  );

  return (
    <LocationPickerPanel
      query={query}
      onQueryChange={setQuery}
      scope={{
        path,
        // A row's full path is its ancestors reversed to root-first, then the
        // row itself — and that is true however the row was found, which is why
        // the path is rebuilt rather than appended to. Browsing, it reduces to
        // appending, because a browse row's ancestors *are* the current
        // breadcrumb. Searching, it is the only thing that can be right: nobody
        // drilled through Finland and Uusimaa to reach a school in Helsinki, so
        // appending would leave the breadcrumb claiming the school sits
        // directly under every country.
        onDrill: (pick) =>
          setUserPath([...[...pick.ancestors].reverse(), pick.location]),
        onOpenDepth: (depth) => setUserPath(path.slice(0, depth)),
        minQueryLength: LOCATION_SEARCH_MIN_QUERY,
        browse: {
          rows: browseRows,
          total: level.data?.pages.at(-1)?.total ?? browseRows.length,
          hasMore: level.hasNextPage,
          onLoadMore: () => void level.fetchNextPage(),
          // Only the first page's absence is a loading state: a later page
          // appends under rows already on screen and must not blank them.
          loading: level.isPending,
        },
        search: {
          rows: searchRows,
          total: search.data?.total ?? 0,
          hasMore: false,
          // Pending only while there is nothing at all to show. Once a needle
          // has hits they stay on screen through the next keystroke's debounce
          // and request — the list the user is reading is replaced, never
          // emptied.
          loading: search.isPending,
        },
        selection,
      }}
    />
  );
}

interface LocationPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Types a row may be confirmed as. */
  pickableTypes: readonly LocationType[];
  /** Breadcrumb to open on, root first. Absent opens at the top of the tree. */
  initialPath?: readonly LocationChainSummary[];
  /** Offer only rows in this country, browsing and searching alike. */
  countryCode?: string;
  onConfirm: (pick: LocationPick) => Promise<unknown>;
}

/**
 * Confirm one place. The caller gets the row itself plus its ancestors, which
 * is everything needed to write the foreign key and render the place with its
 * path without a second read.
 */
export function LocationPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  pickableTypes,
  initialPath,
  countryCode,
  onConfirm,
}: LocationPickerDialogProps) {
  return (
    <LocationPickerShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <LocationBrowser
        searchTypes={pickableTypes}
        initialPath={initialPath}
        countryCode={countryCode}
        selection={{
          mode: "single",
          pickableTypes,
          onConfirm,
          onCancel: () => onOpenChange(false),
        }}
      />
    </LocationPickerShell>
  );
}

interface LocationCoverageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The `locations.id` of every ticked row. */
  selectedIds: ReadonlySet<string>;
  onToggle: (pick: LocationPick) => void;
}

/**
 * The multi-tick dialog. Ticks land in the caller's state as they are made —
 * there is nothing to confirm here, because what commits them is the caller's
 * own save.
 */
export function LocationCoverageDialog({
  open,
  onOpenChange,
  selectedIds,
  onToggle,
}: LocationCoverageDialogProps) {
  const t = useTranslations("locations.picker");

  return (
    <LocationPickerShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("coverageTitle")}
      description={t("coverageDescription")}
    >
      <LocationBrowser
        selection={{
          mode: "multi",
          selectedIds,
          onToggle,
          onDone: () => onOpenChange(false),
        }}
      />
    </LocationPickerShell>
  );
}
