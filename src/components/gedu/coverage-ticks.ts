/**
 * Pure helpers behind the gedu coverage editor: turning saved `gedu_locations`
 * rows into catalog ticks, toggling ticks, and pairing ticks back up with the
 * rows a code resolution returned.
 *
 * ## Positive selection
 *
 * Each tick is an independent claim — "I cover this whole subtree" — and is
 * stored as exactly one `gedu_locations` row. Ticking a région does not tick
 * its départements, and unticking a commune does not disturb any ancestor tick.
 * (The old cascade, which enumerated descendants so a gedu could express
 * "Uusimaa except Helsinki", is retired: with an exhaustive catalog a gedu ticks
 * what they cover, and matching is an ancestor walk that reads any one of those
 * rows.)
 *
 * ## Why some saved rows can never be a tick
 *
 * A tick is identified by `(country, type, official code)`, which is what the
 * catalogs are keyed on. Two kinds of saved row have no such identity:
 *
 *  - **Sites** — venues an admin named by hand. They exist in no national
 *    classification and carry no `external_code`.
 *  - **Country rows, and anything in a country that ships no catalog** — there
 *    is no catalog page they could be ticked on.
 *
 * Both stay perfectly valid for substitute matching, so they are surfaced as
 * read-only chips the gedu can remove but not re-add here.
 */

import {
  catalogRefKey,
  isCatalogCountry,
  type CatalogPick,
  type CatalogRef,
} from "@/lib/locations/catalog";
import { localizedLocationName } from "@/lib/locations/localized-name";
import type { LocationCodeRef } from "@/services/locations";
import type { Location } from "@/types";

/** One coverage claim, as the editor holds it. */
export interface CoverageTick {
  /** Identity: `(country, type, official code)`. Keyed by `catalogRefKey`. */
  ref: CatalogRef;
  /** What the chip reads — a localized row name, or the official catalog name. */
  label: string;
  /** Ancestor path, when the tick came from the catalog. May be empty. */
  detail: string;
  /**
   * The `locations` row id, when this tick came from a saved row. `null` for a
   * freshly ticked catalog node, which is what save has to resolve.
   */
  locationId: string | null;
}

/** A saved row the catalog cannot show, rendered as a removable chip. */
export interface LegacyCoverageRow {
  id: string;
  label: string;
  /** Sites are venues; everything else is an entry from before the catalog. */
  kind: "venue" | "legacy";
}

export interface CoverageRowSplit {
  ticks: Map<string, CoverageTick>;
  legacy: LegacyCoverageRow[];
}

/**
 * Split a gedu's saved location rows into catalog ticks and chips.
 *
 * A row qualifies as a tick when its country ships a catalog, it carries an
 * official code, and it is not the country row itself — i.e. exactly when the
 * catalog has a node the tick can render on.
 */
export function splitCoverageRows(
  rows: readonly Location[],
  locale: string,
): CoverageRowSplit {
  const ticks = new Map<string, CoverageTick>();
  const legacy: LegacyCoverageRow[] = [];

  for (const row of rows) {
    const label = localizedLocationName(row, locale);
    if (
      row.external_code &&
      row.type !== "country" &&
      isCatalogCountry(row.country_code)
    ) {
      const ref: CatalogRef = {
        country: row.country_code,
        type: row.type,
        code: row.external_code,
      };
      ticks.set(catalogRefKey(ref), {
        ref,
        label,
        // A saved row carries no ancestor chain, so the chip is just its name.
        detail: "",
        locationId: row.id,
      });
      continue;
    }
    legacy.push({
      id: row.id,
      label,
      kind: row.type === "site" ? "venue" : "legacy",
    });
  }

  legacy.sort((a, b) => a.label.localeCompare(b.label, locale));
  return { ticks, legacy };
}

/** Flip one catalog node's tick. Never mutates the input map. */
export function toggleCoverageTick(
  ticks: ReadonlyMap<string, CoverageTick>,
  pick: CatalogPick,
): Map<string, CoverageTick> {
  const key = catalogRefKey(pick);
  const next = new Map(ticks);
  if (next.has(key)) {
    next.delete(key);
    return next;
  }
  next.set(key, {
    ref: { country: pick.country, type: pick.type, code: pick.code },
    label: pick.name,
    detail: pick.ancestors.join(", "),
    locationId: null,
  });
  return next;
}

/** Ticks in display order — by the label the user actually reads. */
export function sortedTicks(
  ticks: ReadonlyMap<string, CoverageTick>,
  locale: string,
): CoverageTick[] {
  return [...ticks.values()].sort((a, b) =>
    a.label.localeCompare(b.label, locale),
  );
}

/**
 * The ticks that still need a row id, grouped by country — one resolution
 * request per country, because `(country_code, type, external_code)` is the
 * key and a code means nothing without its country.
 */
export function pendingTicksByCountry(
  ticks: ReadonlyMap<string, CoverageTick>,
): Map<string, CoverageTick[]> {
  const byCountry = new Map<string, CoverageTick[]>();
  for (const tick of ticks.values()) {
    if (tick.locationId) continue;
    const existing = byCountry.get(tick.ref.country);
    if (existing) existing.push(tick);
    else byCountry.set(tick.ref.country, [tick]);
  }
  return byCountry;
}

/** The `(type, code)` pairs the row resolver takes. */
export function codeRefsOf(
  ticks: readonly CoverageTick[],
): LocationCodeRef[] {
  return ticks.map((tick) => ({
    type: tick.ref.type,
    external_code: tick.ref.code,
  }));
}

export interface ResolvedTicks {
  /** Row ids for the ticks that matched. */
  ids: string[];
  /**
   * Ticks with no row. The resolver is a lookup, not an assertion — a code it
   * finds nothing for comes back simply absent — so this is where a claim the
   * database cannot store gets caught, instead of being silently dropped.
   */
  unresolved: CoverageTick[];
}

/** Pair resolved rows back up with the ticks that asked for them. */
export function matchResolvedRows(
  pending: readonly CoverageTick[],
  rows: readonly Location[],
): ResolvedTicks {
  const byKey = new Map<string, string>();
  for (const row of rows) {
    if (!row.external_code || !row.country_code) continue;
    byKey.set(
      catalogRefKey({
        country: row.country_code,
        type: row.type,
        code: row.external_code,
      }),
      row.id,
    );
  }

  const ids: string[] = [];
  const unresolved: CoverageTick[] = [];
  for (const tick of pending) {
    const id = byKey.get(catalogRefKey(tick.ref));
    if (id) ids.push(id);
    else unresolved.push(tick);
  }
  return { ids, unresolved };
}

/** Whether two tick sets name the same places. */
export function sameTickKeys(
  a: ReadonlyMap<string, CoverageTick>,
  b: ReadonlyMap<string, CoverageTick>,
): boolean {
  if (a.size !== b.size) return false;
  for (const key of a.keys()) if (!b.has(key)) return false;
  return true;
}
