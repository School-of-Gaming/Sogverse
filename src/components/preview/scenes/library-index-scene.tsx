import { LibraryIndexBody } from "@/components/library/index-page/library-index-body";
import { LIBRARY_FILTER_HREFS } from "@/components/library/index-page/library-index-props";

/**
 * The public Library index with nothing published — the live body, handed no
 * articles, under "All".
 *
 * One scenario, because it is the state the seeded database cannot show: the
 * rich seed publishes articles, so the full index is read on `/library` itself.
 */

export const LIBRARY_INDEX_SCENARIOS = ["empty"] as const;

export type LibraryIndexSceneScenario = (typeof LIBRARY_INDEX_SCENARIOS)[number];

export function isLibraryIndexScenario(
  s: string,
): s is LibraryIndexSceneScenario {
  return (LIBRARY_INDEX_SCENARIOS as readonly string[]).includes(s);
}

export function LibraryIndexScene() {
  return (
    <LibraryIndexBody
      articles={[]}
      selectedCategory={null}
      filterHrefs={LIBRARY_FILTER_HREFS}
    />
  );
}
