import type { CatalogNode, LocationCatalog } from "./types";

export type { CatalogNode, LocationCatalog } from "./types";

/**
 * The catalog module's public surface: which countries ship one, how to load
 * one, and the two pure readers (chain lookup, search index) that the
 * materialization route and the picker UI both need.
 */

/**
 * Countries that ship an official catalog in this directory. Adding one is
 * three edits: generate `<code>.json`, add the code here, add its arm to
 * `loadCatalog`. The switch below is exhaustive over this tuple, so forgetting
 * the third is a compile error rather than a runtime one.
 */
export const CATALOG_COUNTRIES = ["FI", "FR"] as const;

export type CatalogCountry = (typeof CATALOG_COUNTRIES)[number];

export function isCatalogCountry(
  code: string | null | undefined,
): code is CatalogCountry {
  return CATALOG_COUNTRIES.some((candidate) => candidate === code);
}

/**
 * One dynamic `import()` per country, so the bundler emits a chunk each and
 * none of them reaches the main bundle — France's file alone is ~890 KB of raw
 * JSON, which is the entire reason this is not a static import. On the server
 * the same call is a plain module load.
 *
 * Typed as `unknown` deliberately. `resolveJsonModule` infers a structural type
 * from the literal file — mutable arrays of unions, not the readonly tuples
 * `types.ts` describes — so the inferred type is neither the contract nor
 * usefully assignable to it. The guard below is what bridges the two.
 */
const LOADERS: Readonly<
  Record<CatalogCountry, () => Promise<{ default: unknown }>>
> = {
  FI: () => import("./fi.json"),
  FR: () => import("./fr.json"),
};

/**
 * Shallow shape check at the JSON boundary.
 *
 * A predicate rather than a cast, and shallow rather than exhaustive, for the
 * same reason: the catalogs are generated, committed assets, so the failure
 * this can realistically catch is a build that shipped the wrong file or a
 * generator whose output shape drifted — both visible at the root. Validating
 * all 34,875 French communes would cost real time on every open and prove
 * nothing the generator's own assertions do not already prove.
 */
function isLocationCatalog(value: unknown): value is LocationCatalog {
  if (typeof value !== "object" || value === null) return false;
  const candidate: Record<string, unknown> = { ...value };
  return (
    typeof candidate.country === "string" &&
    Array.isArray(candidate.levels) &&
    Array.isArray(candidate.tree) &&
    candidate.tree.every(
      (node: unknown) =>
        Array.isArray(node) &&
        typeof node[0] === "string" &&
        typeof node[1] === "string",
    )
  );
}

/** Load one country's catalog, refusing an asset that is not one. */
export async function loadCatalog(
  country: CatalogCountry,
): Promise<LocationCatalog> {
  const { default: data } = await LOADERS[country]();
  if (!isLocationCatalog(data)) {
    throw new Error(`The ${country} location catalog is not a catalog`);
  }
  return data;
}

/**
 * The chain of catalog nodes from a root-level entry down to a leaf, index
 * aligned with `catalog.levels` — so `chain[i]` is a row of type `levels[i]`.
 */
export type CatalogChain = readonly CatalogNode[];

/**
 * Find the leaf (municipality/commune) entry carrying `code`, returning the
 * whole ancestor chain the materializer needs to build.
 *
 * Only leaf depth is searched, which is what makes the lookup unambiguous:
 * France reuses each of its 18 région codes as a département code, so a
 * depth-agnostic search for "01" would have three answers. Leaf codes (INSEE
 * commune, Tilastokeskus kunta) are unique within their own classification.
 */
export function findLeafChain(
  catalog: LocationCatalog,
  code: string,
): CatalogChain | null {
  const leafDepth = catalog.levels.length - 1;

  function walk(
    nodes: readonly CatalogNode[],
    depth: number,
    trail: CatalogNode[],
  ): CatalogChain | null {
    for (const node of nodes) {
      const chain = [...trail, node];
      if (depth === leafDepth) {
        if (node[0] === code) return chain;
        continue;
      }
      const children = node[2];
      if (!children) continue;
      const found = walk(children, depth + 1, chain);
      if (found) return found;
    }
    return null;
  }

  return walk(catalog.tree, 0, []);
}

/** One searchable leaf entry, with its display path and pre-normalized name. */
export interface CatalogEntry {
  /** The official leaf code — what materialization is keyed on. */
  code: string;
  /** The official name, exactly as published. */
  name: string;
  /** Ancestor names, nearest first: `["Nord", "Hauts-de-France"]`. */
  ancestors: readonly string[];
  /** `name` folded for diacritic-insensitive matching. Precomputed once. */
  normalized: string;
}

/**
 * Fold a string for search: strip diacritics and case, so "nimes" finds Nîmes
 * and "jarvenpaa" finds Järvenpää. Decomposing first (NFD) turns "î" into
 * "i" + combining circumflex, and the combining marks are then dropped by
 * range rather than by `\p{Diacritic}` — the escape needs a newer regex target
 * than this project compiles to.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Flatten a catalog to its leaf entries, normalizing each name once.
 *
 * Built a single time per catalog and reused across keystrokes: France has
 * 34,875 communes, so normalizing inside the filter would redo ~35k Unicode
 * decompositions on every character typed.
 */
export function buildCatalogIndex(catalog: LocationCatalog): CatalogEntry[] {
  const leafDepth = catalog.levels.length - 1;
  const entries: CatalogEntry[] = [];

  function walk(
    nodes: readonly CatalogNode[],
    depth: number,
    ancestors: readonly string[],
  ): void {
    for (const [code, name, children] of nodes) {
      if (depth === leafDepth) {
        entries.push({ code, name, ancestors, normalized: normalizeForSearch(name) });
        continue;
      }
      if (children) walk(children, depth + 1, [name, ...ancestors]);
    }
  }

  walk(catalog.tree, 0, []);
  return entries;
}

/** How many results the picker renders — see `searchCatalogIndex`. */
export const CATALOG_SEARCH_LIMIT = 50;

export interface CatalogSearchResult {
  entries: CatalogEntry[];
  /** How many entries matched in total, including the ones not returned. */
  total: number;
}

/**
 * Filter a prebuilt index, prefix matches first, capped at
 * `CATALOG_SEARCH_LIMIT`. The cap is a rendering budget, not a search one: a
 * two-letter query matches thousands of French communes and painting them all
 * is what would make typing feel slow. `total` is still counted so the UI can
 * say how much it is holding back.
 */
export function searchCatalogIndex(
  index: readonly CatalogEntry[],
  query: string,
): CatalogSearchResult {
  const needle = normalizeForSearch(query.trim());
  if (!needle) return { entries: [], total: 0 };

  const prefix: CatalogEntry[] = [];
  const infix: CatalogEntry[] = [];
  let total = 0;

  for (const entry of index) {
    const at = entry.normalized.indexOf(needle);
    // Codes are searchable too — an admin working from an official list has
    // the INSEE/Tilastokeskus code in front of them, not always the spelling.
    // Lowercased on both sides: the needle already is (normalizeForSearch),
    // and 360 French commune codes carry uppercase letters (Corsica's 2A/2B),
    // which would otherwise never match.
    const matches = at !== -1 || entry.code.toLowerCase().startsWith(needle);
    if (!matches) continue;

    total++;
    // Each bucket fills to the limit independently, so a prefix match found
    // late in the scan still outranks an infix match found early. Concatenating
    // and trimming afterwards is what makes that ordering hold.
    const bucket = at === 0 ? prefix : infix;
    if (bucket.length < CATALOG_SEARCH_LIMIT) bucket.push(entry);
  }

  return {
    entries: [...prefix, ...infix].slice(0, CATALOG_SEARCH_LIMIT),
    total,
  };
}
