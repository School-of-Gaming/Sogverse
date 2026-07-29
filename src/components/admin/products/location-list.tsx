"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { normalizeForSearch } from "@/lib/locations/catalog";

/**
 * A searchable, grouped list of database rows the admin can pick one of.
 *
 * This is the counterpart to the catalog panel, not a replacement for it. The
 * catalog browses an exhaustive static classification (34,875 French communes)
 * and never touches the database; this browses the handful of rows that *are*
 * in the database and that no catalog contains or orders — the venues an admin
 * created, and the Finnish municipalities an online club can be funded by.
 * Both are small enough to search client-side in one pass.
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

  // Folding happens once per group/row rather than once per keystroke: the
  // venue list is small today, but this is the same shape the catalog index
  // uses and it costs nothing to be right about it.
  const index = useMemo(
    () =>
      groups.map((group) => ({
        group,
        terms: group.searchTerms.map(normalizeForSearch),
        rows: group.rows.map((row) => ({
          row,
          terms: row.searchTerms.map(normalizeForSearch),
        })),
      })),
    [groups],
  );

  const trimmed = query.trim();

  const visible = useMemo(() => {
    const folded = normalizeForSearch(query.trim());
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
        {loading ? (
          <div
            className="h-full animate-pulse rounded bg-muted"
            aria-label={labels.loading}
          />
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
