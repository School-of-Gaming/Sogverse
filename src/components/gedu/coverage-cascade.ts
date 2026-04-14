/**
 * Pure helpers for gedu coverage-tree cascade semantics.
 * Extracted from gedu-coverage-editor so the non-trivial toggle logic can
 * be unit-tested without mounting the component.
 *
 * Selection rules:
 *   - Ticking a node adds the node AND its entire subtree.
 *   - Unticking a node removes the node, its entire subtree, AND every
 *     selected ancestor — because the ancestor tick meant "I fully cover
 *     my subtree," which is no longer true once a descendant is dropped.
 *     Sibling branches are unaffected.
 *
 * The data model is a flat `Set<location_id>` per gedu; the cascade
 * semantics live in the toggle handler, not the storage.
 */

import type { Location } from "@/types";

export interface CoverageRelations {
  /** For each location id, every transitive descendant id. */
  descendantsOf: Map<string, string[]>;
  /** For each location id, its direct parent id (if any). */
  parentOf: Map<string, string>;
}

/** Build descendants + parent lookup maps from a flat locations list. */
export function buildCoverageRelations(locations: Location[]): CoverageRelations {
  const childrenOf = new Map<string, string[]>();
  for (const loc of locations) {
    if (loc.parent_id) {
      const existing = childrenOf.get(loc.parent_id);
      if (existing) existing.push(loc.id);
      else childrenOf.set(loc.parent_id, [loc.id]);
    }
  }

  const descendantsOf = new Map<string, string[]>();
  const walk = (id: string): string[] => {
    const cached = descendantsOf.get(id);
    if (cached) return cached;
    const direct = childrenOf.get(id) ?? [];
    const all = [...direct];
    for (const child of direct) all.push(...walk(child));
    descendantsOf.set(id, all);
    return all;
  };
  for (const loc of locations) walk(loc.id);

  const parentOf = new Map<string, string>();
  for (const loc of locations) {
    if (loc.parent_id) parentOf.set(loc.id, loc.parent_id);
  }

  return { descendantsOf, parentOf };
}

/**
 * Apply the tick/untick cascade for a single location id and return the
 * new selected set. Never mutates the input set.
 */
export function toggleCoverage(
  selected: ReadonlySet<string>,
  id: string,
  relations: CoverageRelations,
): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
    for (const d of relations.descendantsOf.get(id) ?? []) next.delete(d);
    let parent = relations.parentOf.get(id);
    while (parent) {
      next.delete(parent);
      parent = relations.parentOf.get(parent);
    }
  } else {
    next.add(id);
    for (const d of relations.descendantsOf.get(id) ?? []) next.add(d);
  }
  return next;
}
