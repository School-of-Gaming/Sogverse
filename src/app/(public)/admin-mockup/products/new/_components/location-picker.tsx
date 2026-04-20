"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MapPin,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  LOCATIONS,
  buildLocationTree,
  filterLocationTree,
  type MockLocation,
  type MockLocationNode,
  type MockLocationType,
} from "../_mock/data";

/** What kind of child a given node can spawn. `null` means "it's a leaf." */
function childTypeFor(parent: MockLocation): MockLocationType | null {
  switch (parent.type) {
    case "country":
      return "region";
    case "region":
      return "municipality";
    case "municipality":
      return "site";
    case "site":
      return null;
  }
}

const TYPE_LABEL: Record<MockLocationType, string> = {
  country: "country",
  region: "region",
  municipality: "municipality",
  site: "site",
};

interface LocationPickerProps {
  value: string | null;
  onChange: (locationId: string | null) => void;
  /**
   * "site" — only sites may be picked (used for in-person products).
   * "any"  — sites, municipalities, regions, or countries may be picked
   *          (used for online products — an online club can be "owned by
   *          Helsinki municipality" without a physical venue).
   */
  pickable?: "site" | "any";
}

export function LocationPicker({ value, onChange, pickable = "site" }: LocationPickerProps) {
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  // Mockup-only: locations the admin adds during this session. Merged with
  // the base LOCATIONS to build the tree. In the real app this is the
  // locations service + a "create location" RPC.
  const [extraLocations, setExtraLocations] = useState<MockLocation[]>([]);
  // `null` parent means "adding a country at the root of the tree".
  const [addUnder, setAddUnder] = useState<MockLocation | null | "root">(null);

  const allLocations = useMemo(
    () => [...LOCATIONS, ...extraLocations],
    [extraLocations],
  );
  const tree = useMemo(() => buildLocationTree(allLocations), [allLocations]);
  const filtered = useMemo(
    () => filterLocationTree(tree, query),
    [tree, query],
  );
  const selected = value ? allLocations.find((l) => l.id === value) : undefined;

  // Compact summary when a location is picked and the user isn't editing.
  // Sites show address + access notes (from the site itself, read-only).
  // Non-site picks (used by online products) show a jurisdiction hint instead.
  if (selected && !browsing) {
    const ancestors = buildAncestorChain(selected.id, allLocations)
      .filter((a) => a.id !== selected.id)
      .filter((a) => a.type !== "country");
    const isSite = selected.type === "site";
    return (
      <div className="space-y-3">
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
                {ancestors.length > 0 && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {ancestors.map((a) => a.name).join(" · ")}
                  </div>
                )}
                {selected.address && (
                  <div className="mt-1 text-sm text-muted-foreground">
                    {selected.address}
                  </div>
                )}
                {!isSite && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No physical venue. Parents browsing at-or-under {selected.name}
                    {" "}will see this product in their results.
                  </p>
                )}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setBrowsing(true)}
              className="shrink-0 gap-1"
            >
              <Pencil className="h-3.5 w-3.5" />
              Change
            </Button>
          </div>

          {isSite && selected.accessNotes && (
            <div className="mt-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Access notes for this site
              </div>
              <p className="mt-1 text-sm">{selected.accessNotes}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Edit these on the site&apos;s location record — they&apos;re shared
                by every product at this site.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const handlePick = (site: MockLocation) => {
    onChange(site.id);
    setBrowsing(false);
    setQuery("");
  };

  const handleLocationCreated = (loc: MockLocation) => {
    setExtraLocations((prev) => [...prev, loc]);
    // Auto-select only when the new location is a valid pick for this mode.
    if (pickable === "any" || loc.type === "site") {
      onChange(loc.id);
      setBrowsing(false);
      setQuery("");
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by country, region, municipality, or site…"
          className="pl-10"
          autoFocus={browsing}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="max-h-[360px] overflow-y-auto rounded-md border border-input bg-background p-2">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No locations match &quot;{query}&quot;.
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
                onPick={handlePick}
                onAddChildUnder={(parent) => setAddUnder(parent)}
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
            Add a new country
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {pickable === "site"
            ? "Pick a site. You can add any level — country, region, municipality, or site — inline if it's missing."
            : "Pick any level — country, region, municipality, or site. Missing a region or municipality? Add it inline."}
        </span>
        {selected && (
          <button
            type="button"
            onClick={() => setBrowsing(false)}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Cancel
          </button>
        )}
      </div>

      <AddLocationDialog
        target={addUnder}
        onOpenChange={(open) => {
          if (!open) setAddUnder(null);
        }}
        onCreated={(loc) => {
          setAddUnder(null);
          handleLocationCreated(loc);
        }}
      />
    </div>
  );
}

function buildAncestorChain(locationId: string, all: MockLocation[]): MockLocation[] {
  const byId = new Map(all.map((l) => [l.id, l]));
  const chain: MockLocation[] = [];
  const seen = new Set<string>();
  let current = byId.get(locationId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

interface TreeRowProps {
  node: MockLocationNode;
  depth: number;
  query: string;
  selectedId: string | null;
  pickable: "site" | "any";
  onPick: (location: MockLocation) => void;
  onAddChildUnder: (parent: MockLocation) => void;
}

function TreeRow({
  node,
  depth,
  query,
  selectedId,
  pickable,
  onPick,
  onAddChildUnder,
}: TreeRowProps) {
  // Countries expand by default; others collapse. Searching forces expand
  // so matches are always visible.
  const [expanded, setExpanded] = useState(depth === 0);
  const isExpanded = query ? true : expanded;
  const hasChildren = node.children.length > 0;
  const isSite = node.type === "site";
  const isPickable = pickable === "any" || isSite;
  const isSelected = isPickable && selectedId === node.id;
  const childType = childTypeFor(node);

  const childLabel = childCountLabel(node);

  const handleClick = () => {
    if (isPickable && (isSite || !hasChildren)) {
      // Leaf-ish: commit the pick. Non-site picks that still have children
      // expand instead so the admin can drill deeper if they want.
      onPick(node);
      return;
    }
    if (hasChildren) {
      setExpanded((e) => !e);
    }
  };

  // Non-site rows in "any" mode get a small "Pick this" button so clicking the
  // row still expands but an explicit action is available.
  const showPickButton = pickable === "any" && !isSite;

  const hasHoverActions = showPickButton || childType !== null;

  return (
    <div>
      <div
        onClick={handleClick}
        className={cn(
          "group flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isPickable ? "hover:bg-primary/10" : "hover:bg-muted",
          isSelected && "bg-primary/10 text-primary",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground",
            !hasChildren && "invisible",
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
            <span className={cn("truncate", isSite && "font-medium")}>{node.name}</span>
            {childLabel && (
              <span className="shrink-0 text-xs text-muted-foreground">
                {childLabel}
              </span>
            )}
          </div>
          {isSite && node.address && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {node.address}
            </div>
          )}
        </div>

        {hasHoverActions && (
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
                title={`Use ${node.name} as the product's location`}
              >
                Pick
              </Button>
            )}
            {childType && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddChildUnder(node);
                }}
                title={`Add a ${TYPE_LABEL[childType]} under ${node.name}`}
              >
                <Plus className="h-3 w-3" />
                Add {TYPE_LABEL[childType]}
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
              onAddChildUnder={onAddChildUnder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function childCountLabel(node: MockLocationNode): string | null {
  if (node.type === "site") return null;
  const count = node.children.length;
  if (count === 0) {
    if (node.type === "municipality") return "no sites yet";
    return null;
  }
  const singular: Record<Exclude<MockLocation["type"], "site">, string> = {
    country: "region",
    region: "municipality",
    municipality: "site",
  };
  const label = singular[node.type];
  return `${count} ${count === 1 ? label : pluralize(label)}`;
}

function pluralize(word: string): string {
  if (word.endsWith("y")) return word.slice(0, -1) + "ies";
  return word + "s";
}

// -------- Add-location dialog --------
//
// Adapts to the target level: countries/regions/municipalities take just a
// name; sites also take an address and access notes (which live on the
// `site_details` extension table per the redesign doc).

type AddTarget = MockLocation | "root" | null;

interface AddLocationDialogProps {
  target: AddTarget;
  onOpenChange: (open: boolean) => void;
  onCreated: (loc: MockLocation) => void;
}

function AddLocationDialog({ target, onOpenChange, onCreated }: AddLocationDialogProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [accessNotes, setAccessNotes] = useState("");

  const open = target !== null;
  const childType: MockLocationType | null =
    target === "root" ? "country" : target ? childTypeFor(target) : null;
  const parentName = target === "root" ? null : target?.name ?? null;

  const reset = () => {
    setName("");
    setAddress("");
    setAccessNotes("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!childType || !name.trim()) return;
    const loc: MockLocation = {
      id: `loc-custom-${Date.now()}`,
      name: name.trim(),
      type: childType,
      parentId: target === "root" ? null : target?.id ?? null,
      ...(childType === "site"
        ? {
            address: address.trim() || undefined,
            accessNotes: accessNotes.trim() || undefined,
          }
        : {}),
    };
    onCreated(loc);
    reset();
  };

  const typeLabel = childType ? TYPE_LABEL[childType] : "";
  const placeholderByType: Record<MockLocationType, string> = {
    country: "e.g. Estonia",
    region: "e.g. Satakunta",
    municipality: "e.g. Lahti",
    site: "e.g. Malminkartanon koulu",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {childType ? `Add ${typeLabel}` : "Add location"}
          </DialogTitle>
          <DialogDescription>
            {parentName
              ? `Creating a new ${typeLabel} under ${parentName}.`
              : childType === "country"
                ? "Creating a new country at the root of the location tree."
                : ""}
            {childType === "site" &&
              " These details live on the site itself and are shared by every product hosted there."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="locName">
              {typeLabel ? typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1) : "Name"}{" "}
              name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="locName"
              placeholder={childType ? placeholderByType[childType] : ""}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          {childType === "site" && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="siteAddress">Address</Label>
                <Input
                  id="siteAddress"
                  placeholder="Street, postal code, city"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="siteAccess">Access notes</Label>
                <textarea
                  id="siteAccess"
                  rows={3}
                  placeholder="Entrance, gate codes, parking, where to meet — shared by every product at this site."
                  value={accessNotes}
                  onChange={(e) => setAccessNotes(e.target.value)}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Create {typeLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
