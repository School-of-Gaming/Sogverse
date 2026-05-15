"use client";

import {
  useMyUpcomingSessions,
  type MyUpcomingSessionRow,
} from "@/services/participations";
import { SessionsSection } from "./SessionsSection";

/**
 * Data-bound variant of `SessionsSection` for the parent dashboard. Calls
 * `useMyUpcomingSessions` (which owns the expansion + reads `useNow()` for
 * the clock tick) and forwards the resulting `sessions` shape — `null`
 * while loading, `[]` when the parent has no placed participations,
 * otherwise the time-sorted list.
 *
 * `initialRows` is the server-prefetched payload (`parent/page.tsx`
 * fetches via `ParticipationsService` and passes it down). When supplied,
 * the React Query cache is seeded on first client render so the list
 * paints immediately — no skeleton flash. Without it, the hook falls
 * back to its own client-side fetch.
 *
 * The presentational `SessionsSection` stays prop-driven so the admin UI
 * demo can keep feeding it fixture data for its loading / empty / live /
 * countdown variants.
 */
export function ParentSessionsSection({
  initialRows,
}: {
  initialRows: MyUpcomingSessionRow[];
}) {
  const { sessions } = useMyUpcomingSessions("customer", {
    initialData: initialRows,
  });
  return <SessionsSection sessions={sessions} />;
}
