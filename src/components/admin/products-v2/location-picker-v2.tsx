"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MapPin,
  Pencil,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAllLocations } from "@/services/locations";
import { useSiteDetailsV2 } from "@/services/products-v2";
import type { Location, LocationType } from "@/types";

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

  const { data: locations } = useAllLocations();
  const all = useMemo(() => locations ?? [], [locations]);

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

  // Tree browser.
  function pickNode(node: LocationNode) {
    onChange(node.id);
    setBrowsing(false);
    setQuery("");
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
              />
            ))}
          </div>
        )}
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
}

function TreeRow({
  node,
  depth,
  query,
  selectedId,
  pickable,
  onPick,
}: TreeRowProps) {
  const t = useTranslations("admin.productsV2.locationPicker");
  const [expanded, setExpanded] = useState(depth === 0);
  const isExpanded = query ? true : expanded;
  const hasChildren = node.children.length > 0;
  const isSite = node.type === "site";
  const isPickable = pickable === "site" ? isSite : !isSite;
  const isSelected = isPickable && selectedId === node.id;
  const childLabel =
    pickable === "jurisdiction" && node.type === "municipality"
      ? null
      : childCountLabel(node, t);
  const showPickButton = pickable === "jurisdiction" && !isSite;

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
            {childLabel && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {childLabel}
              </span>
            )}
          </div>
        </div>
        {showPickButton && (
          <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

const CHILD_SINGULAR: Record<Exclude<LocationType, "site">, string> = {
  country: "region",
  region: "municipality",
  municipality: "site",
  district: "site",
};

function childCountLabel(
  node: LocationNode,
  t: ReturnType<typeof useTranslations>
): string | null {
  if (node.type === "site") return null;
  const count = node.children.length;
  if (count === 0) {
    if (node.type === "municipality") return t("noSitesYet");
    return null;
  }
  if (node.type === "district") return null;
  const word = CHILD_SINGULAR[node.type];
  return `${count} ${count === 1 ? word : pluralize(word)}`;
}

function pluralize(word: string): string {
  if (word.endsWith("y")) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
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
          {/* Member-visible notes: address + notes from site_details_v2. */}
          <div className="rounded-md border border-input bg-background p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("memberNotesLabel")}
            </div>
            {details?.member?.address ? (
              <div className="mt-1">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("addressLabel")}:
                </span>{" "}
                <span>{details.member.address}</span>
              </div>
            ) : null}
            {details?.member?.notes ? (
              <p className="mt-1 whitespace-pre-wrap">
                {details.member.notes}
              </p>
            ) : null}
            {!details?.member?.address && !details?.member?.notes && (
              <p className="mt-1 text-muted-foreground">
                {t("noMemberNotes")}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {t("memberNotesHint")}
            </p>
          </div>

          {/* Staff-only notes: site_staff_details_v2. RLS returns null for
              non-admin/Gedu callers. */}
          <div className="rounded-md border border-input bg-background p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {t("staffNotesLabel")}
            </div>
            {details?.staff?.notes ? (
              <p className="mt-1 whitespace-pre-wrap">{details.staff.notes}</p>
            ) : (
              <p className="mt-1 text-muted-foreground">
                {t("noStaffNotes")}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              {t("staffNotesHint")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
