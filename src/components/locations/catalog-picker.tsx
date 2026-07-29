"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { useRevealAfter } from "@/hooks/use-reveal-after";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  catalogRefKey,
  isCatalogCountry,
  loadCatalog,
  normalizeForSearch,
  searchCatalogIndex,
  type CatalogCountry,
  type CatalogEntry,
  type CatalogNode,
  type CatalogPick,
  type LocationCatalog,
} from "@/lib/locations/catalog";

/**
 * Browse, search and pick places out of a country's official catalog.
 *
 * Two things live here, split along the line the style guide cares about:
 *
 *  - `CatalogPicker` is presentational. It is handed a catalog and a
 *    `selection` config, owns only its own search/browse state, and makes no
 *    network call — which is what lets the /admin/ui-components demo drive it
 *    from a five-node fixture.
 *  - `CatalogDialogShell` is the container every dialog shares: it chooses the
 *    country and loads that country's catalog behind a dynamic `import()`,
 *    holding one fixed height across loading, failure and loaded so the dialog
 *    never resizes under the pointer.
 *
 * The catalog is never bundled with the page. France's is ~890 KB of raw JSON,
 * so it is fetched as its own chunk the first time a dialog opens, and the
 * whole search runs client-side from then on — no round-trip per keystroke.
 *
 * ## The two selection modes
 *
 * **single** confirms exactly one leaf (a municipality/commune). Nothing is
 * written by confirming: every commune is already a seeded row, so the caller
 * resolves the confirmed code to that row and carries on from there.
 *
 * **multi** ticks any number of nodes at *any* level, and each tick is an
 * independent "I cover this whole subtree" claim. Ticking a parent deliberately
 * does **not** tick, pre-tick or half-tick its descendants: one claim is one
 * tick, and a descendant showing as ticked would make the panel say something
 * the saved rows do not. Drilling into a ticked région therefore shows every
 * département under it unticked, which is correct — they are covered by the
 * ancestor's row, not by rows of their own.
 */

/** Fixed body height, so the panel never resizes as results come and go. */
const PANEL_HEIGHT = "h-[440px]";

/** Punctuation between a place and its path — not copy, so not translated. */
const PATH_SEPARATOR = " — ";

/** Confirm one leaf entry. The catalog's original purpose. */
interface SingleSelection {
  mode: "single";
  /**
   * Persist the picked entry. A rejection re-enables the button and surfaces
   * the message; on success the caller is expected to swap this view away.
   */
  onConfirm: (entry: CatalogEntry) => Promise<unknown>;
  onCancel: () => void;
}

/** Tick any number of nodes, at any level. */
interface MultiSelection {
  mode: "multi";
  /** `catalogRefKey` of every ticked node, across every country. */
  tickedKeys: ReadonlySet<string>;
  /** Called with the node that was clicked; the caller flips it. */
  onToggle: (pick: CatalogPick) => void;
  /** Ticks apply as they are made, so this only dismisses the panel. */
  onDone: () => void;
}

export type CatalogSelection = SingleSelection | MultiSelection;

interface CatalogPickerProps {
  catalog: LocationCatalog;
  /** Localized country name — the root of the browse breadcrumb. */
  countryLabel: string;
  selection: CatalogSelection;
}

export function CatalogPicker({
  catalog,
  countryLabel,
  selection,
}: CatalogPickerProps) {
  const t = useTranslations("locations.catalog");
  const c = useTranslations("common");

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CatalogEntry | null>(null);
  /** Nodes drilled into, root first. Empty means "at the top level". */
  const [path, setPath] = useState<CatalogNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  /**
   * Held locally rather than read off the mutation: `isPending` flips false the
   * moment the mutation resolves, which is before the caller has swapped this
   * panel away — a gap in which the button would re-enable and a fast admin
   * could confirm twice. Set synchronously before `onConfirm`, and cleared
   * only on the failure path, where a retry is the point.
   */
  const [committing, setCommitting] = useState(false);

  const multi = selection.mode === "multi";
  // Multi ticks any level, so its search has to reach the levels above the
  // leaves; single only ever confirms a leaf.
  const index = useMemo(
    () => buildCatalogIndex(catalog, { includeAllLevels: multi }),
    [catalog, multi],
  );
  const results = useMemo(
    () => searchCatalogIndex(index, query),
    [index, query],
  );

  const searching = query.trim().length > 0;
  const leafDepth = catalog.levels.length - 1;
  const level = path.length;
  const nodes = level === 0 ? catalog.tree : (path[level - 1][2] ?? []);

  function pickOf(entry: CatalogEntry): CatalogPick {
    return {
      country: catalog.country,
      type: entry.type,
      code: entry.code,
      name: entry.name,
      ancestors: entry.ancestors,
    };
  }

  /** The browse list's rows, as index entries, so both paths share one shape. */
  function browseEntry(node: CatalogNode): CatalogEntry {
    return {
      code: node[0],
      type: catalog.levels[level],
      name: node[1],
      ancestors: path.map((n) => n[1]).reverse(),
      // Only the search path reads the folded name; a browsed pick fills it
      // the same way so both routes produce one shape.
      normalized: normalizeForSearch(node[1]),
    };
  }

  function handleConfirm() {
    if (selection.mode !== "single" || !selected || committing) return;
    setError(null);
    setCommitting(true);
    selection.onConfirm(selected).catch((err: unknown) => {
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

  /**
   * One row, in whichever mode is active. `drillTo` is the node to descend
   * into — absent for a leaf and for every searched result, since a search hit
   * is on screen because of the query, not because of the browse position.
   */
  function renderRow(
    entry: CatalogEntry,
    detail: string,
    drillTo?: CatalogNode,
  ) {
    if (selection.mode === "multi") {
      const pick = pickOf(entry);
      const key = catalogRefKey(pick);
      return (
        <TickRow
          key={key}
          name={entry.name}
          detail={detail}
          checked={selection.tickedKeys.has(key)}
          onToggle={() => selection.onToggle(pick)}
          onDrill={drillTo ? () => setPath((p) => [...p, drillTo]) : undefined}
          drillLabel={t("browseInto", { name: entry.name })}
        />
      );
    }
    return (
      <PickRow
        key={entry.code}
        name={entry.name}
        detail={detail}
        selected={!drillTo && selected?.code === entry.code}
        hasChildren={!!drillTo}
        onClick={() => {
          if (drillTo) setPath((p) => [...p, drillTo]);
          else setSelected(entry);
        }}
      />
    );
  }

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
            aria-label={t("clearSearch")}
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
              {results.entries.map((entry) =>
                renderRow(entry, entry.ancestors.join(", ")),
              )}
            </div>
          )
        ) : (
          <div className="space-y-0.5">
            {/* No detail text while browsing: the breadcrumb already says
                where we are, and the official code ("Kainuu — 18") reads as
                noise to anyone who isn't holding the INSEE/Tilastokeskus
                list. Codes stay searchable — that's where they earn a place. */}
            {nodes.map((node) =>
              renderRow(
                browseEntry(node),
                "",
                level < leafDepth ? node : undefined,
              ),
            )}
          </div>
        )}
      </div>

      {/* One reserved line for the truncation hint or a failure message, so
          neither one can push the buttons around when it appears. */}
      <p className={cn("min-h-[20px] text-xs", statusLine?.tone)}>
        {statusLine?.text}
      </p>

      {selection.mode === "multi" ? (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {t("tickedCount", { count: selection.tickedKeys.size })}
          </p>
          <Button type="button" onClick={selection.onDone}>
            {t("done")}
          </Button>
        </div>
      ) : (
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
              <span className="text-muted-foreground">
                {t("nothingSelected")}
              </span>
            )}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={selection.onCancel}
              disabled={committing}
            >
              {c("cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={!selected || committing}
            >
              {committing ? t("confirming") : t("confirm")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PickRowProps {
  name: string;
  detail: string;
  selected: boolean;
  hasChildren?: boolean;
  onClick: () => void;
}

/** Single mode: the whole row is one button — drill in, or select the leaf. */
function PickRow({
  name,
  detail,
  selected,
  hasChildren,
  onClick,
}: PickRowProps) {
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
      <RowLabel name={name} detail={detail} />
      {hasChildren && (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

interface TickRowProps {
  name: string;
  detail: string;
  checked: boolean;
  onToggle: () => void;
  /** Absent on a leaf and on every searched result. */
  onDrill?: () => void;
  drillLabel: string;
}

/**
 * Multi mode: the row carries two independent affordances — the checkbox (and
 * its label) makes the coverage claim, the chevron drills in — so ticking a
 * place and looking inside it are never the same click.
 */
function TickRow({
  name,
  detail,
  checked,
  onToggle,
  onDrill,
  drillLabel,
}: TickRowProps) {
  // Interaction split, same as every tree UI here has had: clicking a row
  // that can be descended into NAVIGATES — the checkbox alone makes the
  // claim. Someone looking for Helsinki clicks "Uusimaa" expecting to see its
  // municipalities, not to accidentally claim the whole region off a small
  // chevron mis-read. A leaf row (and every search result) has nowhere to
  // descend, so there the whole row toggles.
  if (!onDrill) {
    return (
      <div className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
          <Checkbox checked={checked} onChange={onToggle} />
          <RowLabel name={name} detail={detail} />
        </label>
        {/* Keeps the label column the same width whether or not a row can be
            drilled into, so names don't jump between levels. */}
        <span className="h-6 w-6 shrink-0" aria-hidden="true" />
      </div>
    );
  }
  return (
    <div className="flex w-full items-center gap-2 rounded-md pl-2 text-sm hover:bg-accent hover:text-accent-foreground">
      <Checkbox checked={checked} onChange={onToggle} aria-label={name} />
      <button
        type="button"
        onClick={onDrill}
        aria-label={drillLabel}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 pr-2 text-left"
      >
        <RowLabel name={name} detail={detail} />
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    </div>
  );
}

function RowLabel({ name, detail }: { name: string; detail: string }) {
  return (
    <span className="min-w-0 flex-1 truncate">
      <span className="font-medium">{name}</span>
      {detail && (
        <span className="text-muted-foreground">
          {PATH_SEPARATOR}
          {detail}
        </span>
      )}
    </span>
  );
}

interface CatalogDialogShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /**
   * Rendered once the country's catalog is in memory. Keyed on the country by
   * the shell, so a panel's browse position and selection reset on a switch.
   */
  children: (args: {
    catalog: LocationCatalog;
    country: CatalogCountry;
    countryLabel: string;
  }) => ReactNode;
}

/**
 * The country select + code-split catalog load + error/retry, at one fixed
 * height. Every catalog dialog shares it; only the panel inside differs.
 */
export function CatalogDialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: CatalogDialogShellProps) {
  const t = useTranslations("locations.catalog");
  const locale = useLocale();

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
  // its own chunk, only once the user opens this dialog. A failed load (flaky
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
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
            children({ catalog, country, countryLabel })
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
            <CatalogLoadingSkeleton label={t("loading")} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The loading stand-in for the panel: same height, same internal layout
 * (search bar, breadcrumb line, list box with ghost rows, footer), instead of
 * one solid block — a 440px grey slab reads as a broken page, not a loading
 * one. It also stays *invisible for the reveal delay*: on a warm cache the
 * chunk lands faster than that, and flashing a skeleton for two frames is
 * worse than showing nothing in a box that already has its final size.
 */
function CatalogLoadingSkeleton({ label }: { label: string }) {
  const visible = useRevealAfter();

  return (
    <div
      className={cn(
        "flex flex-col gap-3 transition-opacity duration-200",
        PANEL_HEIGHT,
        visible ? "opacity-100" : "opacity-0",
      )}
      aria-label={label}
      aria-busy="true"
    >
      <div className="h-10 animate-pulse rounded-md bg-muted" />
      <div className="h-5 w-40 animate-pulse rounded bg-muted" />
      <div className="min-h-0 flex-1 space-y-2 rounded-md border border-input p-3">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="h-7 animate-pulse rounded bg-muted"
            style={{ width: `${88 - (i % 4) * 9}%` }}
          />
        ))}
      </div>
      <div className="h-5 animate-pulse rounded bg-muted" />
    </div>
  );
}

interface CatalogCoverageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `catalogRefKey` of every ticked node, across every country. */
  tickedKeys: ReadonlySet<string>;
  onToggle: (pick: CatalogPick) => void;
}

/**
 * The multi-tick dialog. Ticks land in the caller's state as they are made —
 * there is nothing to confirm here, because what commits them is the caller's
 * own save.
 */
export function CatalogCoverageDialog({
  open,
  onOpenChange,
  tickedKeys,
  onToggle,
}: CatalogCoverageDialogProps) {
  const t = useTranslations("locations.catalog");

  return (
    <CatalogDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("coverageTitle")}
      description={t("coverageDescription")}
    >
      {({ catalog, country, countryLabel }) => (
        <CatalogPicker
          key={country}
          catalog={catalog}
          countryLabel={countryLabel}
          selection={{
            mode: "multi",
            tickedKeys,
            onToggle,
            onDone: () => onOpenChange(false),
          }}
        />
      )}
    </CatalogDialogShell>
  );
}
