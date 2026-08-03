"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { withoutCountry } from "@/lib/locations/ancestor-chain";
import { localizedLocationName } from "@/lib/locations/localized-name";
import {
  filterLocationGroups,
  indexLocationGroups,
  type LocationGroup,
} from "./location-groups";
import type { Json, LocationType } from "@/types";

/**
 * The one panel every location picker in this app is a configuration of.
 *
 * Purely presentational: it is handed rows and handlers and reports what was
 * clicked. It makes no network call and holds no data — which is what lets the
 * /admin/ui-components demos drive every configuration from fixtures, and what
 * keeps the paging, debouncing and caching in one place above it.
 *
 * ## The axis: what the panel is showing before the first keystroke
 *
 * There used to be two components here, and everything they had in common was
 * written twice — the search box, the selected-row highlight, the name-plus-
 * muted-detail row, the fixed-height box with its empty and no-results states.
 * What was actually different is one thing, and it is the `scope`:
 *
 * **tree** browses the hierarchy. It opens on the rows with no parent — the
 * countries — and every step down is the same request against the same index.
 * There is no country to pick first, and search is cross-country from the first
 * keystroke for the same reason: nothing is sharded by country, so nothing has
 * to be chosen before a user can type. A pick is staged and then confirmed,
 * because the panel is a dialog the caller opened to answer one question.
 *
 * **set** lists a bounded collection the surface has *already* fetched in full,
 * grouped under the place above each row. An admin picking a venue usually does
 * not know which municipality it is in, and should not have to walk Finland →
 * Uusimaa → Helsinki to find one; the rows are hundreds, not thousands, so they
 * are filtered in the browser with no request and no loading state. It renders
 * inline in a form rather than in a dialog, so a click *is* the pick — the form
 * around it owns the commit, and there is nothing here to confirm.
 *
 * Everything else is shared: the row rendering, the chains, the fixed height,
 * the search box and its clear button. In tree scope the selection mode is a
 * further axis on top.
 *
 * ## The two selection modes (tree scope)
 *
 * **single** confirms exactly one row, of one of the `pickableTypes`. A row of
 * a pickable type is terminal — clicking it selects it rather than descending
 * into it — so the level a caller wants is the level the panel stops at.
 *
 * **multi** ticks any number of rows at *any* level, and each tick is an
 * independent "I cover this whole subtree" claim. Ticking a parent deliberately
 * does **not** tick, pre-tick or half-tick its descendants: one claim is one
 * tick, and a descendant showing as ticked would make the panel say something
 * the saved rows do not. Drilling into a ticked région therefore shows every
 * département under it unticked, which is correct — they are covered by the
 * ancestor's row, not by rows of their own. An empty selection is valid.
 */

/** Fixed body height for the tree scope, so the panel never resizes as results come and go. */
export const LOCATION_PANEL_HEIGHT = "h-[440px]";

/**
 * Fixed list height for the set scope. The panel is inline in a form there
 * rather than filling a dialog, so the *list* is what is pinned and the chrome
 * around it belongs to the form.
 */
const LOCATION_SET_HEIGHT = "h-[340px]";

/** Punctuation between a place and its path — not copy, so not translated. */
const PATH_SEPARATOR = " — ";

/** What a rendered ancestor needs: a name to show and a level to filter on. */
export interface LocationChainSummary {
  id: string;
  name: string;
  name_i18n: Json | null;
  type: LocationType;
}

/**
 * The columns any *selectable* row needs. Both a browse row and a search hit
 * satisfy it. `country_code` is here and not on a chain node because the level
 * naming below a row is per-country metadata, and only a picked row is ever
 * asked what its children would be called.
 */
export interface LocationSummary extends LocationChainSummary {
  country_code: string | null;
}

/** A row and where it sits, which is everything a caller needs back from a pick. */
export interface LocationPick {
  location: LocationSummary;
  /** Ancestors nearest first, so `ancestors[0]` is the level immediately above. */
  ancestors: LocationChainSummary[];
}

/** Confirm one row, of a type the caller accepts. */
interface SingleSelection {
  mode: "single";
  /** Types a row may be confirmed as. A row of one of these does not drill. */
  pickableTypes: readonly LocationType[];
  /**
   * Persist the pick. A rejection re-enables the button and surfaces the
   * message; on success the caller is expected to swap this view away.
   */
  onConfirm: (pick: LocationPick) => Promise<unknown>;
  onCancel: () => void;
}

/** Tick any number of rows, at any level. */
interface MultiSelection {
  mode: "multi";
  /** The `locations.id` of every ticked row. */
  selectedIds: ReadonlySet<string>;
  /** Called with the row that was clicked; the caller flips it. */
  onToggle: (pick: LocationPick) => void;
  /** Ticks apply as they are made, so this only dismisses the panel. */
  onDone: () => void;
}

export type LocationSelection = SingleSelection | MultiSelection;

/** One level of the tree, or one page of search hits. */
export interface LocationPanelRows {
  /** Rows to render, in the order they should appear. */
  rows: readonly LocationPick[];
  /** How many rows match in total — larger than `rows` when a cap applied. */
  total: number;
  /** Another page exists; the panel offers to append it. */
  hasMore: boolean;
  onLoadMore?: () => void;
  /** The rows have not arrived yet. The box keeps its size and stays empty. */
  loading: boolean;
}

/** Browse the hierarchy, a level at a time, searching it on the server. */
export interface LocationTreeScope {
  kind: "tree";
  /** Nodes drilled into, root first. Empty means "at the top of the tree". */
  path: readonly LocationChainSummary[];
  /**
   * Descend into a row. The whole pick is handed over, not just the row: a hit
   * reached by search was never drilled through, so its ancestors are the only
   * record of where it lives and the caller needs them to place the breadcrumb.
   */
  onDrill: (pick: LocationPick) => void;
  /** Go back to a breadcrumb position: `depth` is how many nodes to keep. */
  onOpenDepth: (depth: number) => void;
  /** How many characters search needs before it runs. */
  minQueryLength: number;
  /** The current level. Ignored while a search is running. */
  browse: LocationPanelRows;
  /** The current query's hits. Ignored while the query is too short. */
  search: LocationPanelRows;
  selection: LocationSelection;
}

/** List a bounded set the caller already holds, grouped and filtered in memory. */
export interface LocationSetScope {
  kind: "set";
  groups: readonly LocationGroup[];
  /**
   * What this set *is*, in the caller's words. The tree's placeholder and empty
   * state are universal ("search by name or code", "nothing here"); a set's are
   * not — "no venues yet" and "no municipalities are available" are different
   * claims about different collections, and only the caller knows which.
   */
  labels: { searchPlaceholder: string; empty: string };
  /** The picked row, when it is one of these. */
  value: string | null;
  /** A click is the pick: the form around this panel owns the commit. */
  onSelect: (pick: LocationPick) => void;
  /** Rendered under the list — e.g. the "new venue" affordance. */
  footer?: ReactNode;
}

export type LocationScope = LocationTreeScope | LocationSetScope;

interface LocationPickerPanelProps {
  query: string;
  onQueryChange: (query: string) => void;
  scope: LocationScope;
}

export function LocationPickerPanel({
  query,
  onQueryChange,
  scope,
}: LocationPickerPanelProps) {
  const t = useTranslations("locations.picker");
  const tree = scope.kind === "tree";

  return (
    // A flex column only where the height is pinned and the list has to take up
    // the slack. The set scope stacks instead: its list carries its own height,
    // and a flex column would stretch the caller's footer button to the full
    // width of the form rather than to its label.
    <div
      className={
        tree ? cn("flex flex-col gap-3", LOCATION_PANEL_HEIGHT) : "space-y-3"
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={
            scope.kind === "set"
              ? scope.labels.searchPlaceholder
              : t("searchPlaceholder")
          }
          className="pl-10"
          // Only the tree scope opens in a dialog the user asked for; the set
          // scope sits inside a form, where stealing focus on mount would jump
          // the admin out of whatever field they were filling in.
          autoFocus={tree}
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={t("clearSearch")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {scope.kind === "tree" ? (
        <TreeScopeBody
          scope={scope}
          query={query}
          onQueryChange={onQueryChange}
        />
      ) : (
        <SetScopeBody scope={scope} query={query} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tree scope                                                         */
/* ------------------------------------------------------------------ */

interface TreeScopeBodyProps {
  scope: LocationTreeScope;
  query: string;
  onQueryChange: (query: string) => void;
}

function TreeScopeBody({ scope, query, onQueryChange }: TreeScopeBodyProps) {
  const t = useTranslations("locations.picker");
  const c = useTranslations("common");
  const locale = useLocale();

  const { path, selection, minQueryLength } = scope;

  const [selected, setSelected] = useState<LocationPick | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Held locally rather than read off the mutation: `isPending` flips false the
   * moment the mutation resolves, which is before the caller has swapped this
   * panel away — a gap in which the button would re-enable and a fast admin
   * could confirm twice. Set synchronously before `onConfirm`, and cleared
   * only on the failure path, where a retry is the point.
   */
  const [committing, setCommitting] = useState(false);

  const trimmed = query.trim();
  const searching = trimmed.length >= minQueryLength;
  const active = searching ? scope.search : scope.browse;

  function isPickable(row: LocationSummary): boolean {
    return (
      selection.mode === "single" && selection.pickableTypes.includes(row.type)
    );
  }

  /**
   * Whether a row can be opened. A site is the leaf type by construction —
   * nothing is ever parented under one — and in single mode a row the caller
   * would accept is terminal, so clicking it commits rather than descends.
   */
  function isDrillable(row: LocationSummary): boolean {
    return row.type !== "site" && !isPickable(row);
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

  /** Drilling from a search hit jumps the breadcrumb to where that hit lives. */
  function handleDrill(pick: LocationPick) {
    scope.onDrill(pick);
    if (searching) onQueryChange("");
  }

  const statusLine = error
    ? { text: error, tone: "text-destructive" }
    : // Typing below the threshold leaves the browse list where it is and says
      // why nothing is happening, rather than replacing what the user can see.
      trimmed.length > 0 && !searching
      ? {
          text: t("keepTyping", { count: minQueryLength }),
          tone: "text-muted-foreground",
        }
      : searching && active.total > active.rows.length
        ? {
            text: t("showingSome", {
              shown: active.rows.length,
              total: active.total,
            }),
            tone: "text-muted-foreground",
          }
        : null;

  function renderRow(pick: LocationPick) {
    const row = pick.location;
    const name = localizedLocationName(row, locale);
    // A browse row's position is the breadcrumb, so repeating it under every
    // name would be noise; a search hit's is the only thing telling two
    // identically-named communes apart.
    const detail = searching
      ? withoutCountry(pick.ancestors)
          .map((node) => localizedLocationName(node, locale))
          .join(", ")
      : "";
    const drill = isDrillable(row) ? () => handleDrill(pick) : undefined;

    if (selection.mode === "multi") {
      return (
        <TickRow
          key={row.id}
          name={name}
          detail={detail}
          checked={selection.selectedIds.has(row.id)}
          onToggle={() => selection.onToggle(pick)}
          onDrill={drill}
          drillLabel={t("browseInto", { name })}
        />
      );
    }
    return (
      <PickRow
        key={row.id}
        name={name}
        detail={detail}
        selected={!drill && selected?.location.id === row.id}
        hasChildren={!!drill}
        onClick={() => {
          if (drill) drill();
          else setSelected(pick);
        }}
      />
    );
  }

  return (
    <>
      {/* Breadcrumb. Always rendered — it is the browse position when idle and
          the "you are searching everywhere" note while typing — so the list
          below it never moves. */}
      <div className="flex min-h-[20px] flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {searching ? (
          <span>{t("searchingEverywhere")}</span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => scope.onOpenDepth(0)}
              className="rounded underline-offset-2 hover:text-foreground hover:underline"
            >
              {t("allCountries")}
            </button>
            {path.map((node, depth) => (
              <span key={node.id} className="flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                <button
                  type="button"
                  onClick={() => scope.onOpenDepth(depth + 1)}
                  className="rounded underline-offset-2 hover:text-foreground hover:underline"
                >
                  {localizedLocationName(node, locale)}
                </button>
              </span>
            ))}
          </>
        )}
      </div>

      {/* One fixed-height box across loading, empty and loaded. Both reads
          behind it are small indexed lookups, so the loading state is simply
          the empty box: a skeleton would be on screen for less time than it
          takes to read it. */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-input bg-background p-2">
        {active.loading ? null : active.rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {searching ? t("noResults", { query: trimmed }) : t("nothingHere")}
          </p>
        ) : (
          <div className="space-y-0.5">
            {active.rows.map(renderRow)}
            {active.hasMore && active.onLoadMore && (
              <div className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={active.onLoadMore}
                >
                  {t("loadMore")}
                </Button>
              </div>
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
            {t("tickedCount", { count: selection.selectedIds.size })}
          </p>
          <Button type="button" onClick={selection.onDone}>
            {t("done")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-sm">
            {selected ? (
              <SelectedLine pick={selected} />
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
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Set scope                                                          */
/* ------------------------------------------------------------------ */

function SetScopeBody({
  scope,
  query,
}: {
  scope: LocationSetScope;
  query: string;
}) {
  const t = useTranslations("locations.picker");
  const locale = useLocale();

  // Folding happens once per group and row rather than once per keystroke.
  const index = useMemo(() => indexLocationGroups(scope.groups), [scope.groups]);
  const trimmed = query.trim();
  const visible = useMemo(
    () => filterLocationGroups(index, trimmed),
    [index, trimmed],
  );

  return (
    <>
      {/* The rows behind this are one bounded, indexed read — every venue, or
          one country's municipalities — and the filtering is local, so there is
          no loading state to render and no request a keystroke can be waiting
          on. The box has its final height from the first frame either way. */}
      <div
        className={cn(
          "overflow-y-auto rounded-md border border-input bg-background p-2",
          LOCATION_SET_HEIGHT,
        )}
      >
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {trimmed ? t("noResults", { query: trimmed }) : scope.labels.empty}
          </p>
        ) : (
          <div className="space-y-3">
            {visible.map((group) => (
              <div key={group.key} className="space-y-0.5">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                  {group.detail && (
                    <span className="font-normal normal-case tracking-normal">
                      {PATH_SEPARATOR}
                      {group.detail}
                    </span>
                  )}
                </div>
                {group.rows.map((pick) => (
                  <PickRow
                    key={pick.location.id}
                    name={localizedLocationName(pick.location, locale)}
                    // Every row here sits under a header that already says
                    // where it is, so repeating the path would be noise.
                    detail=""
                    selected={pick.location.id === scope.value}
                    onClick={() => scope.onSelect(pick)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {scope.footer}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Rows                                                               */
/* ------------------------------------------------------------------ */

function SelectedLine({ pick }: { pick: LocationPick }) {
  const locale = useLocale();
  const path = withoutCountry(pick.ancestors).map((node) =>
    localizedLocationName(node, locale),
  );

  return (
    <span>
      <span className="font-medium">
        {localizedLocationName(pick.location, locale)}
      </span>
      {path.length > 0 && (
        <span className="text-muted-foreground">
          {PATH_SEPARATOR}
          {path.join(", ")}
        </span>
      )}
    </span>
  );
}

interface PickRowProps {
  name: string;
  detail: string;
  selected: boolean;
  hasChildren?: boolean;
  onClick: () => void;
}

/** The whole row is one button — drill in, or take the row. */
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
  /** Absent on a leaf. */
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
  // chevron mis-read. A leaf row has nowhere to descend, so there the whole
  // row toggles.
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

/**
 * The dialog every location picker opens in. There is nothing to load before
 * the panel can render — the first level is a request like any other — so this
 * is a frame and not a state machine, which is the whole of what the old
 * country-select-plus-catalog-download shell has become.
 */
export function LocationPickerShell({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
