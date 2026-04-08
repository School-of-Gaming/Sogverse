"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, Plus, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getChildLevel, getTypeLabel } from "@/lib/constants/location-hierarchies";
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
  onAdd: (parent: Location) => void;
  onEdit: (location: Location) => void;
  searchQuery: string;
}

function LocationTreeNode({
  node,
  depth,
  onAdd,
  onEdit,
  searchQuery,
}: LocationTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1 || !!searchQuery);
  const hasChildren = node.children.length > 0;
  const childLevel = getChildLevel(node.country_code, node.type);
  const canAddChildren = childLevel !== null;
  const typeLabel = getTypeLabel(node.country_code, node.type);

  // When searching, auto-expand
  const isExpanded = searchQuery ? true : expanded;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50",
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground",
            !hasChildren && "invisible"
          )}
        >
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        <span className="font-medium">{node.name}</span>

        <Badge variant="outline" className="text-xs">
          {typeLabel}
        </Badge>

        {node.country_code && node.type === "country" && (
          <span className="text-xs text-muted-foreground">
            {node.country_code}
          </span>
        )}

        <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100">
          {canAddChildren && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onAdd(node)}
              title={`Add ${childLevel.label} under ${node.name}`}
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
  if (nodes.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {searchQuery
          ? "No locations found matching your search."
          : "No locations yet. Add a country to get started."}
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
          onAdd={onAdd}
          onEdit={onEdit}
          searchQuery={searchQuery}
        />
      ))}
    </div>
  );
}
