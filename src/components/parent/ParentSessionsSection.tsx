"use client";

import { useMyUpcomingSessions } from "@/services/participations";
import { SessionsSection } from "./SessionsSection";

/**
 * Data-bound variant of `SessionsSection` for the parent dashboard. Calls
 * `useMyUpcomingSessions` (which owns the fetch + the 30s clock tick) and
 * forwards the resulting `sessions` shape — `null` while loading, `[]` when
 * the parent has no placed participations, otherwise the time-sorted list.
 *
 * The presentational `SessionsSection` stays prop-driven so the admin UI
 * demo can keep feeding it fixture data for its loading / empty / live /
 * countdown variants.
 */
export function ParentSessionsSection() {
  const { sessions } = useMyUpcomingSessions("customer");
  return <SessionsSection sessions={sessions} />;
}
