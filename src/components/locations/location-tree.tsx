"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Pencil } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getChildLevel, resolveLabels } from "@/lib/constants";
import type { Location } from "@/types";

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
    const selfMatches = node.name.toLowerCase().includes(q);
    if (selfMatches || filteredChildren.length > 0) {
      acc.push({
        ...node,
        children: selfMatches ? node.children : filteredChildren,
      });
    }
    return acc;
  }, []);
}

/** Build a tree from a flat list of locations. */
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

  // Sort children alphabetically at every level
  const sortChildren = (nodes: LocationNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const node of nodes) sortChildren(node.children);
  };
  sortChildren(roots);

  return roots;
}

interface LocationTreeNodeProps {
  node: LocationNode;
  depth: number;
  locale: string;
  onAdd?: (parent: Location) => void;
  onEdit?: (location: Location) => void;
  searchQuery: string;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

function LocationTreeNode({
  node,
  depth,
  locale,
  onAdd,
  onEdit,
  searchQuery,
  selectable,
  selectedIds,
  onToggleSelect,
}: LocationTreeNodeProps) {
  // In the admin locations view, top-level countries are expanded by default
  // so admins can see the full tree at a glance. In selectable (gedu coverage)
  // mode we start everything collapsed because gedus just need to drill into
  // the one country they cover.
  const initialExpanded = !selectable && depth < 1;
  const [expanded, setExpanded] = useState(initialExpanded || !!searchQuery);
  const hasChildren = node.children.length > 0;
  const childLevel = getChildLevel(node.country_code, node.type);
  const childLabels = childLevel ? resolveLabels(childLevel, locale) : null;
  const canAddChildren = childLevel !== null;
  const childCount = node.children.length;

  // When searching, auto-expand
  const isExpanded = searchQuery ? true : expanded;

  const isSelected = selectedIds?.has(node.id) ?? false;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50",
          hasChildren && "cursor-pointer",
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground",
            !hasChildren && "invisible",
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>

        {selectable && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect?.(node.id)}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 shrink-0 accent-primary cursor-pointer"
            aria-label={node.name}
          />
        )}

        <span className="font-medium">{node.name}</span>

        {childLabels && childCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {childCount} {childCount === 1 ? childLabels.label.toLowerCase() : childLabels.pluralLabel.toLowerCase()}
          </span>
        )}

        {!selectable && (
          <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            {canAddChildren && onAdd && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onAdd(node)}
                title={`Add ${childLabels!.label} under ${node.name}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            )}
            {node.type !== "country" && onEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEdit(node)}
                title={`Edit ${node.name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <LocationTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              locale={locale}
              onAdd={onAdd}
              onEdit={onEdit}
              searchQuery={searchQuery}
              selectable={selectable}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LocationTreeProps {
  nodes: LocationNode[];
  searchQuery: string;
  onAdd?: (parent: Location) => void;
  onEdit?: (location: Location) => void;
  /** When true, each row renders a checkbox instead of hover edit buttons. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

export function LocationTree({
  nodes,
  onAdd,
  onEdit,
  searchQuery,
  selectable,
  selectedIds,
  onToggleSelect,
}: LocationTreeProps) {
  const t = useTranslations("admin.locations");
  const locale = useLocale();
  if (nodes.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {searchQuery
          ? t("noLocationsMatchSearch")
          : t("noLocationsYet")}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <LocationTreeNode
          key={node.id}
          node={node}
          depth={0}
          locale={locale}
          onAdd={onAdd}
          onEdit={onEdit}
          searchQuery={searchQuery}
          selectable={selectable}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </div>
  );
}
