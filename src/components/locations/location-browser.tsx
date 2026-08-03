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
 */

interface LocationBrowserProps {
  selection: LocationSelection;
  /** Restrict search hits to these types. Browsing always shows every level. */
  searchTypes?: readonly LocationType[];
}

export function LocationBrowser({
  selection,
  searchTypes,
}: LocationBrowserProps) {
  /** Nodes drilled into, root first. Empty means "at the top of the tree". */
  const [path, setPath] = useState<LocationChainSummary[]>([]);
  const [query, setQuery] = useState("");

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
      .map((row: Location) => ({ location: row, ancestors }));
  }, [level.data, path]);

  const searchRows = useMemo<LocationPick[]>(
    () =>
      (search.data?.results ?? []).map((hit) => ({
        location: hit,
        ancestors: hit.ancestors,
      })),
    [search.data],
  );

  return (
    <LocationPickerPanel
      path={path}
      // A row's full path is its ancestors reversed to root-first, then the row
      // itself — and that is true however the row was found, which is why the
      // path is rebuilt rather than appended to. Browsing, it reduces to
      // appending, because a browse row's ancestors *are* the current
      // breadcrumb. Searching, it is the only thing that can be right: nobody
      // drilled through Finland and Uusimaa to reach a school in Helsinki, so
      // appending would leave the breadcrumb claiming the school sits directly
      // under every country.
      onDrill={(pick) =>
        setPath([...[...pick.ancestors].reverse(), pick.location])
      }
      onOpenDepth={(depth) => setPath((current) => current.slice(0, depth))}
      query={query}
      onQueryChange={setQuery}
      minQueryLength={LOCATION_SEARCH_MIN_QUERY}
      browse={{
        rows: browseRows,
        total: level.data?.pages.at(-1)?.total ?? browseRows.length,
        hasMore: level.hasNextPage,
        onLoadMore: () => void level.fetchNextPage(),
        // Only the first page's absence is a loading state: a later page
        // appends under rows already on screen and must not blank them.
        loading: level.isPending,
      }}
      search={{
        rows: searchRows,
        total: search.data?.total ?? 0,
        hasMore: false,
        // Pending only while there is nothing at all to show. Once a needle has
        // hits they stay on screen through the next keystroke's debounce and
        // request — the list the user is reading is replaced, never emptied.
        loading: search.isPending,
      }}
      selection={selection}
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
