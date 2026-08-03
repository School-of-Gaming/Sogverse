/**
 * The grouped view of a bounded set: how a list a surface has already fetched
 * in full becomes headers and rows, and how a typed query narrows them without
 * a round trip.
 *
 * These are the two things the picker panel's **set** scope needs and the tree
 * scope does not. They are pure functions rather than panel internals for the
 * same reason the coverage tick helpers are: they carry the decisions worth
 * asserting — which place a row is filed under, what a header match keeps, what
 * a fold considers equal — and none of them need a component mounted to state.
 *
 * ## Filtering here, searching there
 *
 * The tree scope's search is the database's: ranked, capped, cross-country, and
 * the only thing that can answer over 35,000 communes. This filters a few
 * hundred rows already sitting in memory, so it costs no request and has no
 * loading state to design for. The price is a second fold, in TypeScript, which
 * has to agree with the SQL one — a shared table of inputs pins them together
 * in the test suites, so a divergence fails a build instead of quietly making
 * "Nîmes" findable in one picker and not the other.
 */

import { withoutCountry } from "@/lib/locations/ancestor-chain";
import {
  localizedLocationName,
  localizedNameAlternates,
} from "@/lib/locations/localized-name";
import { foldForSearch } from "@/lib/locations/search-fold";
import type {
  LocationChainSummary,
  LocationPick,
  LocationSummary,
} from "./location-picker-panel";

/** Punctuation between the levels above a header — not copy, so not translated. */
const ANCESTOR_SEPARATOR = " · ";

/** The bucket for rows whose chain is empty, which is a real if broken shape. */
const NO_PARENT_KEY = "__none__";

/** A header and the rows filed under it — venues by municipality, municipalities by region. */
export interface LocationGroup {
  key: string;
  /** Header text, already resolved for the viewer's locale. */
  label: string;
  /** Muted context after the header — the levels above the header's own place. */
  detail: string;
  /** Matching the header keeps every row under it: typing a city lists its venues. */
  searchTerms: readonly string[];
  rows: readonly LocationPick[];
}

/** What grouping needs of a row: the row itself, and where it sits. */
type GroupableRow = LocationSummary & {
  ancestors: readonly LocationChainSummary[];
};

/**
 * Every string a query may match on one place — its canonical name plus any
 * alternate-locale names, so "Helsingfors" finds the row rendered as
 * "Helsinki" whatever the viewer's own locale is.
 */
function searchTermsOf(place: LocationChainSummary): string[] {
  return [place.name, ...localizedNameAlternates(place)];
}

/**
 * File rows under the place immediately above them, alphabetically both ways.
 *
 * The header is the nearest non-country ancestor and the rest of the chain
 * becomes its muted context, so a venue list shows the region without opening
 * anything. `fallbackLabel` names the bucket for a row whose chain is empty:
 * municipalities want a visible "elsewhere", venues want nothing rather than a
 * heading that claims more than it knows.
 */
export function groupLocationsByParent(
  rows: readonly GroupableRow[],
  locale: string,
  fallbackLabel: string,
): LocationGroup[] {
  const groups = new Map<string, LocationGroup & { rows: LocationPick[] }>();

  for (const row of rows) {
    const chain = withoutCountry(row.ancestors);
    // `.at()` rather than `[0]`: the chain really can be empty (a row whose
    // parent is missing), and index access would type that away.
    const parent = chain.at(0);
    const above = chain.slice(1);
    const key = parent?.id ?? NO_PARENT_KEY;

    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: parent ? localizedLocationName(parent, locale) : fallbackLabel,
        detail: above
          .map((node) => localizedLocationName(node, locale))
          .join(ANCESTOR_SEPARATOR),
        searchTerms: parent ? searchTermsOf(parent) : [],
        rows: [],
      };
      groups.set(key, group);
    }

    // The whole pick, not just the id: a click has to hand the caller back the
    // row and its chain, which is a foreign key and a path with nothing left
    // to look up — the same thing a confirmed tree pick hands back.
    group.rows.push({ location: row, ancestors: [...row.ancestors] });
  }

  const sorted = [...groups.values()];
  for (const group of sorted) {
    group.rows.sort((a, b) =>
      localizedLocationName(a.location, locale).localeCompare(
        localizedLocationName(b.location, locale),
        locale,
      ),
    );
  }
  return sorted.sort((a, b) => a.label.localeCompare(b.label, locale));
}

/** One group with every string it can be matched by, folded once. */
export interface IndexedLocationGroup {
  group: LocationGroup;
  terms: string[];
  rows: { pick: LocationPick; terms: string[] }[];
}

/**
 * Fold a set once, so a keystroke costs a substring test rather than a
 * re-normalisation of every name on screen.
 */
export function indexLocationGroups(
  groups: readonly LocationGroup[],
): IndexedLocationGroup[] {
  return groups.map((group) => ({
    group,
    terms: group.searchTerms.map(foldForSearch),
    rows: group.rows.map((pick) => ({
      pick,
      terms: searchTermsOf(pick.location).map(foldForSearch),
    })),
  }));
}

/** The groups a query leaves standing. An empty query leaves all of them. */
export function filterLocationGroups(
  index: readonly IndexedLocationGroup[],
  query: string,
): LocationGroup[] {
  const folded = foldForSearch(query.trim());
  if (!folded) return index.map(({ group }) => group);

  return index.flatMap(({ group, terms, rows }) => {
    // A header match keeps the whole group — searching "Helsinki" should list
    // every venue in Helsinki, not just one spelled like it.
    if (terms.some((term) => term.includes(folded))) return [group];
    const matched = rows
      .filter(({ terms: rowTerms }) =>
        rowTerms.some((term) => term.includes(folded)),
      )
      .map(({ pick }) => pick);
    return matched.length > 0 ? [{ ...group, rows: matched }] : [];
  });
}
