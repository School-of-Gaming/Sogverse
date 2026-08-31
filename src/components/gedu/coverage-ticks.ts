/**
 * Pure helpers behind the gedu coverage editor: turning saved `gedu_locations`
 * rows into chips, and toggling a claim.
 *
 * ## Positive selection
 *
 * Each tick is an independent claim — "I cover this whole subtree" — and is
 * stored as exactly one `gedu_locations` row. Ticking a région does not tick
 * its départements, and unticking a commune does not disturb any ancestor tick.
 * Nothing enumerates descendants: a gedu ticks exactly what they cover —
 * "Uusimaa except Helsinki" is just the other municipalities, ticked — and
 * matching is an ancestor walk that reads any one of those rows, so enumerating
 * would only multiply rows saying the same thing. An empty selection is valid
 * and means "remote-only".
 *
 * ## A tick is a row id, and that is the whole of it
 *
 * The picker browses the `locations` table itself, so every ticked node is
 * already a row with an id. There is no identity to translate, nothing to
 * resolve at save time, and therefore no class of claim the editor can show but
 * not store: a site, a country row and a commune are all just rows, tickable
 * and untickable alike. This file is what is left once that translation layer
 * is gone.
 */

import { localizedLocationName } from "@/lib/locations/localized-name";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import type { LocationWithChain } from "@/services/locations";
import type { Json, LocationType } from "@/types";

/** The subset of an ancestor both a saved chain and a picked one satisfy. */
interface ChainNode {
  name: string;
  name_i18n: Json | null;
  type: LocationType;
}

/** One coverage claim, as the editor holds it. */
export interface CoverageTick {
  /** The `locations.id` this claim is stored as. */
  locationId: string;
  /** What the chip reads — the row's name in the viewer's locale. */
  label: string;
  /** The path above it, nearest first, so two homonyms read differently. */
  detail: string;
}

/** Punctuation between path steps — not copy, so not translated. */
const PATH_SEPARATOR = " · ";

/** Ancestor names for a chip: the chain minus the country, root-first. */
function pathOf(ancestors: readonly ChainNode[], locale: string): string {
  return ancestors
    .filter((node) => node.type !== "country")
    .map((node) => localizedLocationName(node, locale))
    .reverse()
    .join(PATH_SEPARATOR);
}

/** Saved rows, in the shape the chips render. */
export function ticksFromRows(
  rows: readonly LocationWithChain[],
  locale: string,
): Map<string, CoverageTick> {
  const ticks = new Map<string, CoverageTick>();
  for (const row of rows) {
    ticks.set(row.id, {
      locationId: row.id,
      label: localizedLocationName(row, locale),
      detail: pathOf(row.ancestors, locale),
    });
  }
  return ticks;
}

/** Flip one row's tick. Never mutates the input map. */
export function toggleCoverageTick(
  ticks: ReadonlyMap<string, CoverageTick>,
  pick: LocationPick,
  locale: string,
): Map<string, CoverageTick> {
  const next = new Map(ticks);
  if (next.has(pick.location.id)) {
    next.delete(pick.location.id);
    return next;
  }
  next.set(pick.location.id, {
    locationId: pick.location.id,
    label: localizedLocationName(pick.location, locale),
    detail: pathOf(pick.ancestors, locale),
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

/** Whether two tick sets name the same places. */
export function sameTickKeys(
  a: ReadonlyMap<string, CoverageTick>,
  b: ReadonlyMap<string, CoverageTick>,
): boolean {
  if (a.size !== b.size) return false;
  for (const key of a.keys()) if (!b.has(key)) return false;
  return true;
}
