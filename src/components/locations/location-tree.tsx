"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { getChildLevel, resolveLabels } from "@/lib/constants";
import {
  localizedLocationName,
  localizedNameAlternates,
} from "@/lib/locations/localized-name";
import {
  LocationFormDialog,
  type LocationFormValues,
} from "@/components/admin/location-form-dialog";
import type { Location } from "@/types";

/**
 * The single, reusable location-tree UI for the whole app. It is purely
 * presentational and free of business logic: the flat `locations` list, the
 * current selection, and the create handler are all injected by the consumer,
 * so the component can be driven entirely by fixtures (see the demo in
 * /admin/ui-components). Three consumers share it:
 *   - the product location picker  (single-select)
 *   - the gedu coverage editor     (multi-select + cascade, cascade in consumer)
 *   - the style-guide demo         (fixtures, no network)
 *
 * Tree building, search, and the create dialog all live here; the consumer
 * just supplies data + callbacks and composes the result into its own layout.
 */

type LocationType = Location["type"];

export interface LocationNode extends Location {
  children: LocationNode[];
}

/**
 * Walk from a location up to its root, returning the chain ordered root → leaf.
 * A visited set guards against malformed `parent_id` cycles — a data bug would
 * otherwise hard-lock any caller that loops over the chain.
 */
export function buildAncestorChain(location: Location, all: Location[]): Location[] {
  const byId = new Map(all.map((l) => [l.id, l]));
  const chain: Location[] = [location];
  const visited = new Set<string>([location.id]);
  let current: Location = location;
  while (current.parent_id) {
    const parent = byId.get(current.parent_id);
    if (!parent || visited.has(parent.id)) break;
    visited.add(parent.id);
    chain.unshift(parent);
    current = parent;
  }
  return chain;
}

/** Build a tree from a flat list of locations, sorted alphabetically at every level. */
export function buildLocationTree(locations: Location[]): LocationNode[] {
  const map = new Map<string, LocationNode>();
  const roots: LocationNode[] = [];

  for (const loc of locations) {
    map.set(loc.id, { ...loc, children: [] });
  }

  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (nodes: LocationNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) sortChildren(node.children);
  };
  sortChildren(roots);

  return roots;
}

/**
 * Recursively filter a location tree, keeping nodes that match the query and
 * every ancestor leading to them. When a node itself matches, its entire
 * subtree is preserved — searching "Helsinki" should show Helsinki and all its
 * child sites so the user can pick one, not just the name match.
 */
export function filterLocationTree(
  nodes: LocationNode[],
  query: string,
): LocationNode[] {
  if (!query) return nodes;
  const q = query.toLowerCase();
  return nodes.reduce<LocationNode[]>((acc, node) => {
    const filteredChildren = filterLocationTree(node.children, query);
    // Match the canonical name and every alternate-locale name, so searching
    // "Helsingfors" surfaces Helsinki regardless of the viewer's UI locale.
    const selfMatches = [node.name, ...localizedNameAlternates(node)].some(
      (n) => n.toLowerCase().includes(q),
    );
    if (selfMatches || filteredChildren.length > 0) {
      acc.push({
        ...node,
        children: selfMatches ? node.children : filteredChildren,
      });
    }
    return acc;
  }, []);
}

/** How the tree decides what's selected and what a click/tick does. */
export type LocationTreeSelection =
  | {
      mode: "single";
      value: string | null;
      onSelect: (id: string) => void;
      /** Node types that can be picked; others are expand-only. */
      pickableTypes: readonly LocationType[];
      /** Label for the explicit "Pick" button shown on pickable nodes that have children. */
      pickLabel?: string;
    }
  | {
      mode: "multi";
      selectedIds: ReadonlySet<string>;
      onToggle: (id: string) => void;
    };

/**
 * Optional inline-create affordance. The consumer owns persistence via
 * `onCreate`.
 *
 * `allowedChildTypes` is `["site"]` everywhere, and that is the design rather
 * than a coincidence: sites are the only level an admin names, because every
 * level above them comes from an official catalog.
 */
export interface LocationTreeCreateConfig {
  /** Child levels the admin may create — `["site"]` shows "+" only on municipalities. */
  allowedChildTypes: readonly LocationType[];
  /** Persist the new location and return the created row (the consumer's mutation). */
  onCreate: (values: LocationFormValues) => Promise<Location>;
  /** Whether a create is in flight (drives the dialog's disabled state). */
  isPending?: boolean;
}

export interface LocationTreeProps {
  /** Flat list of all locations; the tree is built internally. */
  locations: Location[];
  selection: LocationTreeSelection;
  /** Types to hide from the tree entirely — e.g. `["site"]` for municipality picking. */
  hiddenTypes?: readonly LocationType[];
  /** Omit to make the tree read-only (no "+" affordances). */
  create?: LocationTreeCreateConfig;
  /**
   * Row to reveal: its ancestors start expanded, it is highlighted, its row
   * actions are shown without hovering, and it scrolls itself into view. Set
   * after materializing a municipality so the admin lands on the row they just
   * added instead of hunting for it.
   */
  focusId?: string | null;
  /** Placeholder for the search box — the one string that genuinely varies per consumer. */
  searchPlaceholder: string;
  /** Tailwind height for the scroll area, e.g. `"h-[420px]"` or `"max-h-[360px]"`. */
  listClassName?: string;
  className?: string;
}

export function LocationTree({
  locations,
  selection,
  hiddenTypes,
  create,
  focusId,
  searchPlaceholder,
  listClassName,
  className,
}: LocationTreeProps) {
  const locale = useLocale();
  const t = useTranslations("locations.tree");
  const [query, setQuery] = useState("");
  // Null = dialog closed; otherwise the parent node we're adding a child under.
  const [addUnder, setAddUnder] = useState<Location | null>(null);

  const visible = useMemo(
    () =>
      hiddenTypes && hiddenTypes.length > 0
        ? locations.filter((l) => !hiddenTypes.includes(l.type))
        : locations,
    [locations, hiddenTypes],
  );
  const tree = useMemo(() => buildLocationTree(visible), [visible]);
  const filtered = useMemo(() => filterLocationTree(tree, query), [tree, query]);

  // Ids on the path to `focusId`, so those rows mount already expanded.
  const focusChain = useMemo(() => {
    const target = focusId ? locations.find((l) => l.id === focusId) : undefined;
    if (!target) return null;
    return new Set(buildAncestorChain(target, locations).map((l) => l.id));
  }, [focusId, locations]);

  // Expansion is per-row `useState`, so a focus arriving later only takes
  // effect if the rows remount — hence keying the list. The size is in the key
  // because the focused row usually lands one refetch AFTER `focusId` is set:
  // the chain is empty on the first render and complete on the next, and
  // without it the remount would happen while the row still does not exist.
  const rowsKey = `${focusId ?? ""}:${focusChain?.size ?? 0}`;

  async function handleCreate(values: LocationFormValues) {
    if (!create) return;
    const created = await create.onCreate(values);
    setAddUnder(null);
    // Auto-select a freshly created node when it's a valid pick for the mode —
    // the admin just scaffolded the exact thing they were reaching for.
    if (
      selection.mode === "single" &&
      selection.pickableTypes.includes(created.type)
    ) {
      selection.onSelect(created.id);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-10"
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

      <div
        className={cn(
          "overflow-y-auto rounded-md border border-input bg-background p-2",
          listClassName,
        )}
      >
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </div>
        ) : (
          <div className="space-y-0.5" key={rowsKey}>
            {filtered.map((node) => (
              <LocationTreeRow
                key={node.id}
                node={node}
                depth={0}
                locale={locale}
                searching={query.length > 0}
                selection={selection}
                create={create}
                focusId={focusId ?? null}
                focusChain={focusChain}
                onAddUnder={setAddUnder}
              />
            ))}
          </div>
        )}
      </div>

      {create && (
        <LocationFormDialog
          open={addUnder !== null}
          onOpenChange={(open) => {
            if (!open) setAddUnder(null);
          }}
          onSubmit={handleCreate}
          isPending={create.isPending ?? false}
          parent={addUnder}
        />
      )}
    </div>
  );
}

interface LocationTreeRowProps {
  node: LocationNode;
  depth: number;
  locale: string;
  searching: boolean;
  selection: LocationTreeSelection;
  create?: LocationTreeCreateConfig;
  focusId: string | null;
  focusChain: ReadonlySet<string> | null;
  onAddUnder: (parent: Location) => void;
}

function LocationTreeRow({
  node,
  depth,
  locale,
  searching,
  selection,
  create,
  focusId,
  focusChain,
  onAddUnder,
}: LocationTreeRowProps) {
  const isFocused = node.id === focusId;
  // Single mode: countries open by default so the tree is visible at a glance.
  // Multi mode (gedu coverage): start collapsed — gedus drill into one country.
  // A row on the path to the focused node opens regardless, so the focused row
  // is on screen the moment its branch mounts.
  const initialExpanded =
    (selection.mode === "single" && depth === 0) ||
    (focusChain?.has(node.id) ?? false);
  const [expanded, setExpanded] = useState(initialExpanded);
  const rowRef = useRef<HTMLDivElement>(null);

  // Bring the focused row into view. `block: "nearest"` keeps the scroll to the
  // list's own overflow container instead of jumping the page.
  useEffect(() => {
    if (isFocused) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isFocused]);

  const isExpanded = searching ? true : expanded;
  const hasChildren = node.children.length > 0;

  const isPickable =
    selection.mode === "single" && selection.pickableTypes.includes(node.type);
  const isSelected =
    selection.mode === "multi"
      ? selection.selectedIds.has(node.id)
      : selection.value === node.id;

  const childLevel = getChildLevel(node.country_code, node.type);
  const childLabels = childLevel ? resolveLabels(childLevel, locale) : null;
  const canCreateChild =
    !!create && !!childLevel && create.allowedChildTypes.includes(childLevel.type);
  const showPickButton =
    selection.mode === "single" &&
    isPickable &&
    hasChildren &&
    !!selection.pickLabel;

  function handleRowClick() {
    if (selection.mode === "multi") {
      // A row with children expands/collapses on click (the whole row is the
      // dropdown target); only a leaf row toggles its tick. Ticking a parent is
      // still possible via its checkbox directly.
      if (hasChildren) setExpanded((e) => !e);
      else selection.onToggle(node.id);
      return;
    }
    if (isPickable && !hasChildren) {
      selection.onSelect(node.id);
      return;
    }
    if (hasChildren) setExpanded((e) => !e);
    else if (isPickable) selection.onSelect(node.id);
  }

  return (
    <div>
      <div
        ref={rowRef}
        className={cn(
          "group flex items-center gap-1.5 rounded-md px-1.5 py-1.5 transition-colors",
          (hasChildren || isPickable || selection.mode === "multi") && "cursor-pointer",
          isSelected ? "bg-primary/10 text-primary" : "hover:bg-accent hover:text-accent-foreground",
          isFocused && !isSelected && "bg-primary/5 ring-1 ring-primary/40",
        )}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        onClick={handleRowClick}
      >
        <span
          onClick={
            hasChildren
              ? (e) => {
                  // Chevron owns expand/collapse independently of the row's
                  // select/tick action.
                  e.stopPropagation();
                  setExpanded((x) => !x);
                }
              : undefined
          }
          className={cn(
            "flex h-5 w-4 shrink-0 items-center justify-center text-muted-foreground",
            hasChildren && "cursor-pointer",
            !hasChildren && "invisible",
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>

        {selection.mode === "multi" && (
          <Checkbox
            checked={isSelected}
            onChange={() => selection.onToggle(node.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={localizedLocationName(node, locale)}
          />
        )}

        <span className={cn("font-medium", node.type === "site" && "text-sm")}>
          {localizedLocationName(node, locale)}
        </span>

        {(showPickButton || canCreateChild) && (
          <div
            className={cn(
              "ml-auto flex gap-1",
              // The focused row keeps its actions visible: it was just
              // materialized, and "add a site here" is the next step.
              isFocused ? "opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {showPickButton && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => selection.onSelect(node.id)}
              >
                {selection.pickLabel}
              </Button>
            )}
            {canCreateChild && childLabels && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => onAddUnder(node)}
                title={childLabels.label}
              >
                <Plus className="h-3.5 w-3.5" />
                {childLabels.label}
              </Button>
            )}
          </div>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <LocationTreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              locale={locale}
              searching={searching}
              selection={selection}
              create={create}
              focusId={focusId}
              focusChain={focusChain}
              onAddUnder={onAddUnder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
