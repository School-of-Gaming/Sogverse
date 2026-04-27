"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAllLocations, useCreateLocation } from "@/services/locations";
import { useSiteDetailsV2 } from "@/services/products-v2";
import {
  LocationFormDialog,
  type LocationFormValues,
} from "@/components/admin/location-form-dialog";
import { getChildLevel, resolveLabels } from "@/lib/constants";
import type { Location } from "@/types";
import { SiteNotesEditor } from "./site-notes-editor";

type PickableMode = "site" | "jurisdiction";

const ANCESTOR_SEPARATOR = " · ";

interface LocationPickerV2Props {
  value: string | null;
  onChange: (id: string | null) => void;
  /**
   * "site"         — only sites may be picked (in-person products).
   * "jurisdiction" — countries, regions, or municipalities may be picked;
   *                  sites are hidden from the tree. Used for online
   *                  municipality clubs.
   */
  pickable: PickableMode;
}

interface LocationNode extends Location {
  children: LocationNode[];
}

function buildTree(rows: Location[]): LocationNode[] {
  const byId = new Map<string, LocationNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });
  const roots: LocationNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id) {
      const parent = byId.get(node.parent_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortChildren = (n: LocationNode) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name));
    n.children.forEach(sortChildren);
  };
  roots.sort((a, b) => a.name.localeCompare(b.name));
  roots.forEach(sortChildren);
  return roots;
}

function filterTree(tree: LocationNode[], query: string): LocationNode[] {
  if (!query.trim()) return tree;
  const q = query.toLowerCase();
  const walk = (n: LocationNode): LocationNode | null => {
    const kept: LocationNode[] = [];
    for (const c of n.children) {
      const r = walk(c);
      if (r) kept.push(r);
    }
    const selfMatch = n.name.toLowerCase().includes(q);
    if (selfMatch || kept.length > 0) {
      return { ...n, children: kept };
    }
    return null;
  };
  return tree.map(walk).filter((n): n is LocationNode => n !== null);
}

function ancestors(id: string, all: Location[]): Location[] {
  const byId = new Map(all.map((l) => [l.id, l]));
  const chain: Location[] = [];
  const seen = new Set<string>();
  let current: Location | undefined = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return chain;
}

export function LocationPickerV2({
  value,
  onChange,
  pickable,
}: LocationPickerV2Props) {
  const t = useTranslations("admin.productsV2.locationPicker");
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  // Null = dialog closed. "root" = creating a new country at the tree root.
  // Otherwise the parent location we're adding a child under.
  const [addUnder, setAddUnder] = useState<Location | "root" | null>(null);

  const { data: locations } = useAllLocations();
  const createLocation = useCreateLocation();
  const all = useMemo(() => locations ?? [], [locations]);

  const existingCountryCodes = useMemo(
    () =>
      new Set(
        all
          .filter((l) => l.type === "country" && l.country_code)
          .map((l) => l.country_code as string)
      ),
    [all]
  );

  const treeSource = useMemo(
    () =>
      pickable === "jurisdiction"
        ? all.filter((l) => l.type !== "site")
        : all,
    [all, pickable]
  );
  const tree = useMemo(() => buildTree(treeSource), [treeSource]);
  const filtered = useMemo(() => filterTree(tree, query), [tree, query]);

  // Clear selection if the current pick is no longer valid for the mode.
  useEffect(() => {
    if (!value) return;
    const current = all.find((l) => l.id === value);
    if (!current) {
      onChange(null);
      return;
    }
    if (pickable === "site" && current.type !== "site") {
      onChange(null);
    } else if (pickable === "jurisdiction" && current.type === "site") {
      onChange(null);
    }
  }, [pickable, value, all, onChange]);

  const selected = value ? all.find((l) => l.id === value) : undefined;

  // Selected-state card (compact summary with Change button).
  if (selected && !browsing) {
    return (
      <SelectedSiteCard
        selected={selected}
        all={all}
        onChange={() => setBrowsing(true)}
      />
    );
  }

  function pickNode(node: LocationNode) {
    onChange(node.id);
    setBrowsing(false);
    setQuery("");
  }

  async function handleDialogSubmit(values: LocationFormValues) {
    const created = await createLocation.mutateAsync(values);
    setAddUnder(null);
    // Auto-select when the newly created location is a valid pick for the
    // current mode. Otherwise leave selection untouched — admin was just
    // scaffolding the tree on the way to the real pick.
    const validPick =
      (pickable === "site" && created.type === "site") ||
      (pickable === "jurisdiction" && created.type !== "site");
    if (validPick) {
      onChange(created.id);
      setBrowsing(false);
      setQuery("");
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-10"
          autoFocus={browsing}
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

      <div className="max-h-[360px] overflow-y-auto rounded-md border border-input bg-background p-2">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t("noResults", { query })}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                query={query}
                selectedId={value}
                pickable={pickable}
                onPick={pickNode}
                onAddChild={(parent) => setAddUnder(parent)}
              />
            ))}
          </div>
        )}
        <div className="mt-2 border-t border-border pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAddUnder("root")}
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            {t("addCountry")}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {pickable === "site" ? t("hintSite") : t("hintJurisdiction")}
        </span>
        {selected && (
          <button
            type="button"
            onClick={() => setBrowsing(false)}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("cancel")}
          </button>
        )}
      </div>

      <LocationFormDialog
        open={addUnder !== null}
        onOpenChange={(open) => {
          if (!open) setAddUnder(null);
        }}
        onSubmit={handleDialogSubmit}
        isPending={createLocation.isPending}
        parent={addUnder === "root" ? null : addUnder}
        existingCountryCodes={existingCountryCodes}
      />
    </div>
  );
}

interface TreeRowProps {
  node: LocationNode;
  depth: number;
  query: string;
  selectedId: string | null;
  pickable: PickableMode;
  onPick: (node: LocationNode) => void;
  onAddChild: (parent: LocationNode) => void;
}

function TreeRow({
  node,
  depth,
  query,
  selectedId,
  pickable,
  onPick,
  onAddChild,
}: TreeRowProps) {
  const t = useTranslations("admin.productsV2.locationPicker");
  const tLoc = useTranslations("admin.locations");
  const locale = useLocale();
  const [expanded, setExpanded] = useState(depth === 0);
  const isExpanded = query ? true : expanded;
  const hasChildren = node.children.length > 0;
  const isSite = node.type === "site";
  const isPickable = pickable === "site" ? isSite : !isSite;
  const isSelected = isPickable && selectedId === node.id;
  const showPickButton = pickable === "jurisdiction" && !isSite;
  // Suppress "Add site" in jurisdiction mode — sites are hidden from the
  // tree entirely, so creating one here would never surface. Otherwise
  // look up the next level from the country's configured hierarchy so
  // countries with different levels (FI: Maakunta/Kunta, JP: Prefecture/
  // City/Ward) all render using the country's own terminology.
  const childLevel =
    pickable === "jurisdiction" && node.type === "municipality"
      ? null
      : node.country_code
        ? getChildLevel(node.country_code, node.type)
        : null;
  const childLabels = childLevel ? resolveLabels(childLevel, locale) : null;
  // Sibling count hint — "3 regions" / "2 Kuntaa" — uses the same child
  // hierarchy lookup for country-accurate terminology.
  const childCountText =
    pickable === "jurisdiction" && node.type === "municipality"
      ? null
      : childCountLabel(node, childLabels);

  function handleClick() {
    if (isPickable && (isSite || !hasChildren)) {
      onPick(node);
      return;
    }
    if (hasChildren) setExpanded((e) => !e);
  }

  return (
    <div>
      <div
        onClick={handleClick}
        className={cn(
          "group flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isPickable ? "hover:bg-accent" : "hover:bg-muted",
          isSelected && "bg-primary/10 text-primary"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground",
            !hasChildren && "invisible"
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("truncate", isSite && "font-medium")}>
              {node.name}
            </span>
            {childCountText && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {childCountText}
              </span>
            )}
          </div>
        </div>
        {(showPickButton || childLabels) && (
          <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {showPickButton && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(node);
                }}
              >
                {t("pick")}
              </Button>
            )}
            {childLabels && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChild(node);
                }}
                title={tLoc("addChildUnder", {
                  type: childLabels.label,
                  parent: node.name,
                })}
              >
                <Plus className="h-3 w-3" />
                {childLabels.label}
              </Button>
            )}
          </span>
        )}
      </div>
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              query={query}
              selectedId={selectedId}
              pickable={pickable}
              onPick={onPick}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function childCountLabel(
  node: LocationNode,
  childLabels: { label: string; pluralLabel: string } | null
): string | null {
  if (node.type === "site") return null;
  // No child labels = leaf of the configured hierarchy (e.g. a muni in
  // Spain) OR an unsupported country. Either way, no count suffix to show.
  if (!childLabels) return null;
  const count = node.children.length;
  if (count === 0) {
    return `no ${childLabels.pluralLabel.toLowerCase()} yet`;
  }
  return `${count} ${count === 1 ? childLabels.label : childLabels.pluralLabel}`;
}

interface SelectedSiteCardProps {
  selected: Location;
  all: Location[];
  onChange: () => void;
}

function SelectedSiteCard({
  selected,
  all,
  onChange,
}: SelectedSiteCardProps) {
  const t = useTranslations("admin.productsV2.locationPicker");
  const isSite = selected.type === "site";
  // Only sites have site_details_v2 / site_staff_details_v2 rows. For
  // jurisdiction picks we skip the fetch.
  const { data: details } = useSiteDetailsV2(isSite ? selected.id : null);
  const chain = ancestors(selected.id, all)
    .filter((a) => a.id !== selected.id)
    .filter((a) => a.type !== "country");

  return (
    <div className="space-y-2">
      <div className="rounded-md border border-input bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{selected.name}</span>
                {!isSite && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {selected.type}
                  </span>
                )}
              </div>
              {chain.length > 0 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {chain.map((a) => a.name).join(ANCESTOR_SEPARATOR)}
                </div>
              )}
              {!isSite && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("noVenueHint", { name: selected.name })}
                </p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onChange}
            className="shrink-0 gap-1"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("change")}
          </Button>
        </div>
      </div>

      {isSite && (
        <>
          <SiteNotesEditor
            locationId={selected.id}
            tier="member"
            address={details?.member?.address ?? null}
            notes={details?.member?.notes ?? null}
          />
          <SiteNotesEditor
            locationId={selected.id}
            tier="staff"
            notes={details?.staff?.notes ?? null}
          />
        </>
      )}
    </div>
  );
}
