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
  onAdd: (parent: Location) => void;
  onEdit: (location: Location) => void;
  searchQuery: string;
}

function LocationTreeNode({
  node,
  depth,
  locale,
  onAdd,
  onEdit,
  searchQuery,
}: LocationTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1 || !!searchQuery);
  const hasChildren = node.children.length > 0;
  const childLevel = getChildLevel(node.country_code, node.type);
  const childLabels = childLevel ? resolveLabels(childLevel, locale) : null;
  const canAddChildren = childLevel !== null;
  const childCount = node.children.length;

  // When searching, auto-expand
  const isExpanded = searchQuery ? true : expanded;

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
            !hasChildren && "invisible"
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>

        <span className="font-medium">{node.name}</span>

        {childLabels && childCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {childCount} {childCount === 1 ? childLabels.label.toLowerCase() : childLabels.pluralLabel.toLowerCase()}
          </span>
        )}

        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          {canAddChildren && (
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
          {node.type !== "country" && (
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LocationTreeProps {
  nodes: LocationNode[];
  onAdd: (parent: Location) => void;
  onEdit: (location: Location) => void;
  searchQuery: string;
}

export function LocationTree({ nodes, onAdd, onEdit, searchQuery }: LocationTreeProps) {
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
        />
      ))}
    </div>
  );
}
