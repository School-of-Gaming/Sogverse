"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { foldForSearch } from "@/lib/locations/search-fold";

/**
 * A searchable, grouped list of rows the admin can pick one of.
 *
 * This is the counterpart to the tree picker, not a replacement for it. The
 * picker browses the whole hierarchy a level at a time and searches it on the
 * server, because the hierarchy is far larger than any screen. This renders a
 * bounded set the surface has *already* fetched in full and wants grouped — the
 * venues that exist, and the Finnish municipalities an online club can be funded
 * by. Both are small enough to search client-side in one pass, and grouping them
 * by the place above them is what the tree cannot do.
 *
 * Purely presentational: it is handed finished groups and reports the id that
 * was clicked, which is what lets the /admin/ui-components demo drive it from
 * a fixture with no network. It holds one fixed height across empty, loading
 * and loaded, so nothing below it moves as results come and go.
 */

/** One selectable row. */
export interface LocationListRow {
  id: string;
  /** Display name, already resolved for the viewer's locale. */
  name: string;
  /** Muted context after the name. Empty renders nothing. */
  detail: string;
  /**
   * Every string the query may match — the canonical name plus any alternate-
   * locale names, so "Helsingfors" finds the row rendered as "Helsinki".
   */
  searchTerms: string[];
}

/** A header and the rows under it — venues by municipality, municipalities by region. */
export interface LocationListGroup {
  key: string;
  label: string;
  /** Muted context after the header, e.g. the region above a municipality. */
  detail: string;
  /** Matching the header keeps every row under it: typing a city lists its venues. */
  searchTerms: string[];
  rows: LocationListRow[];
}

export interface LocationListLabels {
  searchPlaceholder: string;
  clearSearch: string;
  /** Shown when there is nothing to list at all. */
  empty: string;
  /** Shown when the query matches nothing; receives the trimmed query. */
  noResults: (query: string) => string;
  /** Accessible name for the loading placeholder. */
  loading: string;
}

interface LocationListProps {
  groups: LocationListGroup[];
  /** The currently picked row, if it is in this list. */
  value: string | null;
  onSelect: (id: string) => void;
  /** True until the rows have arrived; renders a placeholder at the same height. */
  loading?: boolean;
  labels: LocationListLabels;
  /** Rendered under the list — e.g. the "new venue" affordance. */
  footer?: ReactNode;
}

/** Fixed body height, so the list never resizes as results come and go. */
const LIST_HEIGHT = "h-[340px]";

/** Punctuation between a name and its context — not copy, so not translated. */
const DETAIL_SEPARATOR = " — ";

export function LocationList({
  groups,
  value,
  onSelect,
  loading,
  labels,
  footer,
}: LocationListProps) {
  const [query, setQuery] = useState("");

  // Folding happens once per group/row rather than once per keystroke.
  const index = useMemo(
    () =>
      groups.map((group) => ({
        group,
        terms: group.searchTerms.map(foldForSearch),
        rows: group.rows.map((row) => ({
          row,
          terms: row.searchTerms.map(foldForSearch),
        })),
      })),
    [groups],
  );

  const trimmed = query.trim();

  const visible = useMemo(() => {
    const folded = foldForSearch(query.trim());
    if (!folded) return groups;
    return index.flatMap(({ group, terms, rows }) => {
      // A header match keeps the whole group — searching "Helsinki" should
      // list every venue in Helsinki, not just one spelled like it.
      if (terms.some((term) => term.includes(folded))) return [group];
      const matched = rows
        .filter(({ terms: rowTerms }) =>
          rowTerms.some((term) => term.includes(folded)),
        )
        .map(({ row }) => row);
      return matched.length > 0 ? [{ ...group, rows: matched }] : [];
    });
  }, [index, groups, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={labels.searchPlaceholder}
          className="pl-10"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={labels.clearSearch}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div
        className={cn(
          "overflow-y-auto rounded-md border border-input bg-background p-2",
          LIST_HEIGHT,
        )}
      >
        {/* Nothing while loading. The rows behind this are one bounded,
            indexed read — every venue, or one country's municipalities — so
            the box simply fills in; a skeleton would be on screen for less
            time than it takes to recognise as one. The box already has its
            final height, so nothing under it moves either way. */}
        {loading ? (
          <span className="sr-only" aria-busy="true">
            {labels.loading}
          </span>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {trimmed ? labels.noResults(trimmed) : labels.empty}
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((group) => (
              <div key={group.key} className="space-y-0.5">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                  {group.detail && (
                    <span className="font-normal normal-case tracking-normal">
                      {DETAIL_SEPARATOR}
                      {group.detail}
                    </span>
                  )}
                </div>
                {group.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onSelect(row.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      row.id === value
                        ? "bg-primary/10 text-primary"
                        : "hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{row.name}</span>
                      {row.detail && (
                        <span className="text-muted-foreground">
                          {DETAIL_SEPARATOR}
                          {row.detail}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {footer}
    </div>
  );
}
