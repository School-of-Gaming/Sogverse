/**
 * The session feed's **shared** machinery — everything a gedu's workspace feed
 * and a family's read-only feed genuinely have in common.
 *
 * A session feed is one grammar rendered by three roles: a descending run of
 * dated sessions, a boundary between what is still to come and what has already
 * happened, month labels down a rail, and a report a reader can open. The row
 * shaping, the viewer-zone labels, the scroll anchoring and the report body are
 * that grammar, and they live here so the surfaces cannot drift apart on where
 * "next" is or on what a month boundary looks like.
 *
 * **What is not here is the point of the split.** The gedu's workspace — the
 * editors, the attendance roster, the completeness ladder, the gedu-note block —
 * stays in `@/components/gedu/session-feed`, and a family surface imports from
 * this module only. That is a structural guarantee rather than a convention: a
 * family page cannot render a gedu note by accident, because there is no such
 * component in the module it can reach, and no entry type here has a field to
 * put one in.
 *
 * The copy these components render lives in the top-level `sessionFeed` message
 * namespace for the same reason — a string both feeds read cannot sit under a
 * role's namespace, or an edit to the gedu's wording silently rewrites what a
 * parent sees.
 */

export { NowDivider } from "./NowDivider";
export { SessionReport } from "./SessionReport";
export {
  FEED_INITIAL_PAST_ENTRIES,
  FEED_PAST_CHUNK_SIZE,
  newestPastEntryId,
  partitionFeedEntries,
  pastEntryWindow,
} from "./feed-shape";
export { withMonthDividers } from "./feed-rows";
export type { SessionFeedRow } from "./feed-rows";
export {
  REPORT_CLAMP_LINES,
  REPORT_CLAMP_REM,
  estimateReportLines,
  reportOverflows,
} from "./report-clamp";
export {
  editToggleAnchor,
  resolveScrollCompensation,
  useViewportAnchor,
} from "./scroll-anchor";
export { formatMonthLabel, formatSessionLabels } from "./session-labels";
export type { SessionLabels } from "./session-labels";
export type { AttendanceMark } from "./types";
