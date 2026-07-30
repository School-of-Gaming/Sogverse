/**
 * DOM ids for the feed's entries.
 *
 * The feed itself never scrolls anywhere — it renders a list and nothing more.
 * These ids exist so a control *outside* the feed can bring one entry into view
 * (the page-level "N need write-ups" jump above the timeline is the current
 * caller). Both ends derive the id from the entry id through this one function,
 * so the button can never guess at a format the list stopped rendering.
 *
 * The prefix matters: entry ids are opaque strings handed in by whoever owns the
 * data, and a bare one could collide with an unrelated element on the page or,
 * on a numeric id, fail to be a usable fragment at all.
 */
export function sessionFeedEntryDomId(entryId: string): string {
  return `session-entry-${entryId}`;
}
