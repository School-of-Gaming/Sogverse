"use client";

import { SessionsSection } from "@/components/parent";
import {
  useMyUpcomingSessions,
  type MyUpcomingSessionRow,
} from "@/services/participations";

/**
 * Gamer-dashboard equivalent of `ParentSessionsSection`. Same presentational
 * `SessionsSection` underneath, same expansion adapter — only the data
 * filter differs: this one passes `audience: "gamer"` so the underlying
 * service reads `participations_v2` keyed by `gamer_id = auth.uid()`,
 * surfacing the sessions for the gamer who is currently logged in (rather
 * than every participation their parent has paid for, across siblings).
 *
 * `initialRows` is the server-prefetched payload from `gamer/page.tsx`,
 * seeding React Query so the list paints on first frame without a
 * skeleton.
 */
export function GamerSessionsSection({
  initialRows,
}: {
  initialRows: MyUpcomingSessionRow[];
}) {
  const sessions = useMyUpcomingSessions("gamer", {
    initialData: initialRows,
  });
  return <SessionsSection sessions={sessions} audience="gamer" />;
}
