"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getCountryConfig, getCountryName } from "@/lib/constants";
import {
  CATALOG_COUNTRIES,
  buildCatalogIndex,
  isCatalogCountry,
  loadCatalog,
  normalizeForSearch,
  searchCatalogIndex,
  type CatalogCountry,
  type CatalogEntry,
  type CatalogNode,
  type LocationCatalog,
} from "@/lib/locations/catalog";
import { useMaterializeLocation } from "@/services/locations";
import type { Location } from "@/types";

/**
 * Pick a municipality out of a country's official catalog.
 *
 * Two components live here, split along the line the style guide cares about:
 *
 *  - `CatalogPicker` is presentational. It is handed a catalog and an
 *    `onConfirm`, owns only its own search/browse/selection state, and makes no
 *    network call — which is what lets the /admin/ui-components demo drive it
 *    from a five-node fixture.
 *  - `CatalogPickerDialog` is the container: it chooses the country, loads that
 *    country's catalog behind a dynamic `import()`, and runs the
 *    materialization mutation.
 *
 * The catalog is never bundled with the page. France's is ~890 KB of raw JSON,
 * so it is fetched as its own chunk the first time this dialog opens, and the
 * whole search runs client-side from then on — no round-trip per keystroke.
 */

/** Fixed body height, so the panel never resizes as results come and go. */
const PANEL_HEIGHT = "h-[440px]";

/** Punctuation between a place and its path — not copy, so not translated. */
const PATH_SEPARATOR = " — ";

interface CatalogPickerProps {
  catalog: LocationCatalog;
  /** Localized country name — the root of the browse breadcrumb. */
  countryLabel: string;
  /**
   * Persist the picked entry. A rejection re-enables the button and surfaces
   * the message; on success the caller is expected to swap this view away.
   */
  onConfirm: (entry: CatalogEntry) => Promise<unknown>;
  onCancel: () => void;
}

export function CatalogPicker({
  catalog,
  countryLabel,
  onConfirm,
  onCancel,
}: CatalogPickerProps) {
  const t = useTranslations("locations.catalog");
  const c = useTranslations("common");
  const tree = useTranslations("locations.tree");

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  /** Nodes drilled into, root first. Empty means "at the top level". */
  const [path, setPath] = useState<CatalogNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  /**
   * Held locally rather than read off the mutation: `isPending` flips false the
   * moment the mutation resolves, which is before the caller has swapped this
   * panel away — a gap in which the button would re-enable and a fast admin
   * could materialize twice. Set synchronously before `onConfirm`, and cleared
   * only on the failure path, where a retry is the point.
   */
  const [committing, setCommitting] = useState(false);

  const index = useMemo(() => buildCatalogIndex(catalog), [catalog]);
  const results = useMemo(
    () => searchCatalogIndex(index, query),
    [index, query],
  );

  const searching = query.trim().length > 0;
  const leafDepth = catalog.levels.length - 1;
  const level = path.length;
  const nodes = level === 0 ? catalog.tree : (path[level - 1][2] ?? []);

  function selectLeaf(node: CatalogNode, ancestors: readonly string[]) {
    setSelected({
      code: node[0],
      name: node[1],
      ancestors,
      // Only the search path reads the folded name; a browsed pick fills it
      // the same way so both routes produce one shape.
      normalized: normalizeForSearch(node[1]),
    });
  }

  function handleConfirm() {
    if (!selected || committing) return;
    setError(null);
    setCommitting(true);
    onConfirm(selected).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : c("unexpectedError"));
      setCommitting(false);
    });
  }

  const statusLine = error
    ? { text: error, tone: "text-destructive" }
    : searching && results.total > results.entries.length
      ? {
          text: t("showingSome", {
            shown: results.entries.length,
            total: results.total,
          }),
          tone: "text-muted-foreground",
        }
      : null;

  return (
    <div className={cn("flex flex-col gap-3", PANEL_HEIGHT)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-10"
          autoFocus
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={tree("clearSearch")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Breadcrumb. Always rendered — it is the browse position when idle and
          the "you are searching everything" note while typing — so the list
          below it never moves. */}
      <div className="flex min-h-[20px] flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {searching ? (
          <span>{t("searchingAll", { country: countryLabel })}</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPath([])}
              className="rounded underline-offset-2 hover:text-foreground hover:underline"
            >
              {countryLabel}
            </button>
            {path.map((node, depth) => (
              <span key={node[0]} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button
                  type="button"
                  onClick={() => setPath((p) => p.slice(0, depth + 1))}
                  className="rounded underline-offset-2 hover:text-foreground hover:underline"
                >
                  {node[1]}
                </button>
              </span>
            ))}
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-input bg-background p-2">
        {searching ? (
          results.entries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("noResults", { query: query.trim() })}
            </p>
          ) : (
            <div className="space-y-0.5">
              {results.entries.map((entry) => (
                <EntryRow
                  key={entry.code}
                  name={entry.name}
                  detail={entry.ancestors.join(", ")}
                  selected={selected?.code === entry.code}
                  onClick={() => setSelected(entry)}
                />
              ))}
            </div>
          )
        ) : (
          <div className="space-y-0.5">
            {nodes.map((node) => (
              <EntryRow
                key={node[0]}
                name={node[1]}
                detail={node[0]}
                selected={level === leafDepth && selected?.code === node[0]}
                hasChildren={level < leafDepth}
                onClick={() => {
                  if (level < leafDepth) setPath((p) => [...p, node]);
                  else
                    selectLeaf(
                      node,
                      path.map((n) => n[1]).reverse(),
                    );
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* One reserved line for the truncation hint or a failure message, so
          neither one can push the buttons around when it appears. */}
      <p className={cn("min-h-[20px] text-xs", statusLine?.tone)}>
        {statusLine?.text}
      </p>

      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 truncate text-sm">
          {selected ? (
            <span>
              <span className="font-medium">{selected.name}</span>
              {selected.ancestors.length > 0 && (
                <span className="text-muted-foreground">
                  {PATH_SEPARATOR}
                  {selected.ancestors.join(", ")}
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{t("nothingSelected")}</span>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={committing}
          >
            {c("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={!selected || committing}
          >
            {committing ? t("adding") : t("confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface EntryRowProps {
  name: string;
  detail: string;
  selected: boolean;
  hasChildren?: boolean;
  onClick: () => void;
}

function EntryRow({
  name,
  detail,
  selected,
  hasChildren,
  onClick,
}: EntryRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
        selected
          ? "bg-primary/10 text-primary"
          : "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{name}</span>
        {detail && (
          <span className="text-muted-foreground">
            {PATH_SEPARATOR}
            {detail}
          </span>
        )}
      </span>
      {hasChildren && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

interface CatalogPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the municipality row once it exists in the database. */
  onMaterialized: (location: Location) => void;
}

export function CatalogPickerDialog({
  open,
  onOpenChange,
  onMaterialized,
}: CatalogPickerDialogProps) {
  const t = useTranslations("locations.catalog");
  const locale = useLocale();
  const materialize = useMaterializeLocation();

  const [country, setCountry] = useState<CatalogCountry>(CATALOG_COUNTRIES[0]);
  /**
   * The loaded catalog carries the country it belongs to, so switching country
   * reads as "not loaded yet" without an effect having to clear it first —
   * a synchronous `setState` in an effect body is a cascading render.
   */
  const [loaded, setLoaded] = useState<{
    country: CatalogCountry;
    catalog: LocationCatalog;
  } | null>(null);
  const catalog = loaded?.country === country ? loaded.catalog : null;
  // Which country's load failed, in the same "carries its country" shape as
  // `loaded` — switching country reads as "no error" without a clearing effect.
  const [errorFor, setErrorFor] = useState<CatalogCountry | null>(null);
  const loadFailed = errorFor === country;

  // The dynamic import is the code-split point: the country's JSON arrives as
  // its own chunk, only once the admin opens this dialog. A failed load (flaky
  // network, a stale chunk URL after a deploy) parks in the error state; the
  // retry button clears it, which re-arms this effect.
  useEffect(() => {
    if (!open || catalog || loadFailed) return;
    let cancelled = false;
    loadCatalog(country).then(
      (result) => {
        if (!cancelled) setLoaded({ country, catalog: result });
      },
      (err: unknown) => {
        console.error("Failed to load the location catalog", err);
        if (!cancelled) setErrorFor(country);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, country, catalog, loadFailed]);

  const countryLabel = useMemo(() => {
    const config = getCountryConfig(country);
    return config ? getCountryName(config, locale) : country;
  }, [country, locale]);

  const selectClassName =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Field label={t("country")} htmlFor="catalog-country">
            <select
              id="catalog-country"
              value={country}
              onChange={(e) => {
                // A guard rather than a cast: the option values come from the
                // same tuple, but the DOM's `value` is only ever a string.
                if (isCatalogCountry(e.target.value)) setCountry(e.target.value);
              }}
              className={selectClassName}
            >
              {CATALOG_COUNTRIES.map((code) => {
                const config = getCountryConfig(code);
                return (
                  <option key={code} value={code}>
                    {config ? getCountryName(config, locale) : code} ({code})
                  </option>
                );
              })}
            </select>
          </Field>

          {catalog ? (
            <CatalogPicker
              // A new catalog is a new search index, a new browse position and
              // a new selection — all of which are this component's state.
              key={country}
              catalog={catalog}
              countryLabel={countryLabel}
              onConfirm={async (entry) => {
                const row = await materialize.mutateAsync({
                  country_code: country,
                  external_code: entry.code,
                });
                onMaterialized(row);
              }}
              onCancel={() => onOpenChange(false)}
            />
          ) : loadFailed ? (
            // Same fixed height as the skeleton and the panel, so the dialog
            // never changes size between loading, failure and loaded.
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-3 rounded-md border border-border",
                PANEL_HEIGHT,
              )}
              role="alert"
            >
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                {t("loadFailed")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setErrorFor(null)}
              >
                {t("retry")}
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                "animate-pulse rounded-md bg-muted",
                PANEL_HEIGHT,
              )}
              aria-label={t("loading")}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
