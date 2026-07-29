"use client";

import { SessionsSection } from "@/components/parent";
import {
  useMyUpcomingSessions,
  useMyWaitlist,
  type MyUpcomingSessionRow,
  type MyWaitlistRow,
} from "@/services/participations";

/**
 * Gamer-dashboard equivalent of `ParentSessionsSection`. Same presentational
 * `SessionsSection` underneath, same expansion adapter — only the data
 * filter differs: this one passes `audience: "gamer"` so the underlying
 * service reads `participations` keyed by `gamer_id = auth.uid()`,
 * surfacing the sessions for the gamer who is currently logged in (rather
 * than every participation their parent has paid for, across siblings).
 *
 * The waitlist band renders here too — a kid in line for a club should be able
 * to see where they are in it — but read-only: no leave handler is passed, and
 * `WaitlistCard` wouldn't render the badge for this audience even if one were.
 * Giving up a place in line is the purchasing parent's call, and the database
 * agrees (`leave_my_waitlist_spot` keys on `customer_id`).
 *
 * `initialRows` / `initialWaitlistRows` are the server-prefetched payloads from
 * `gamer/page.tsx`, seeding React Query so both bands paint on first frame
 * without a skeleton.
 */
export function GamerSessionsSection({
  initialRows,
  initialWaitlistRows,
}: {
  initialRows: MyUpcomingSessionRow[];
  initialWaitlistRows: MyWaitlistRow[];
}) {
  const sessions = useMyUpcomingSessions("gamer", {
    initialData: initialRows,
  });
  const waitlist = useMyWaitlist("gamer", {
    initialData: initialWaitlistRows,
  });
  return (
    <SessionsSection sessions={sessions} waitlist={waitlist} audience="gamer" />
  );
}
