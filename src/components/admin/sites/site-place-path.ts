import { localizedLocationName } from "@/lib/locations/localized-name";
import type { Json } from "@/types";

/** The separator between the levels of a rendered place path. */
export const PLACE_PATH_SEPARATOR = " › ";

/** A chain node, as both the keyed read and the search RPC hand it over. */
export interface PlacePathNode {
  name: string;
  name_i18n: Json | null;
}

/**
 * A site's ancestors as one root-first line: `Suomi › Uusimaa › Helsinki`.
 *
 * Both reads that feed this feature return the chain **nearest first** —
 * `ancestors[0]` is the level immediately above the site, whatever the country
 * — precisely so no consumer has to know how deep a given country's hierarchy
 * runs. A breadcrumb reads the other way, so reversing is the whole of the
 * transformation and it lives here rather than in two components.
 *
 * Names resolve through the shared localizer, so a Swedish-locale admin reads
 * `Finland › Nyland › Helsingfors`. A site's own name is deliberately not part
 * of the path: the surfaces rendering it put the site itself in a heading or a
 * link beside this line, and repeating it would read as a level of the tree.
 */
export function sitePlacePath(
  ancestors: readonly PlacePathNode[],
  locale: string,
): string {
  return [...ancestors]
    .reverse()
    .map((node) => localizedLocationName(node, locale))
    .join(PLACE_PATH_SEPARATOR);
}
