"use client";

import { SessionsSection } from "@/components/parent";
import { useMyUpcomingSessions } from "@/services/participations";

/**
 * Gamer-dashboard equivalent of `ParentSessionsSection`. Same presentational
 * `SessionsSection` underneath, same expansion adapter — only the data
 * filter differs: this one passes `audience: "gamer"` so the underlying
 * service reads `participations_v2` keyed by `gamer_id = auth.uid()`,
 * surfacing the sessions for the gamer who is currently logged in (rather
 * than every participation their parent has paid for, across siblings).
 */
export function GamerSessionsSection() {
  const { sessions } = useMyUpcomingSessions("gamer");
  return <SessionsSection sessions={sessions} audience="gamer" />;
}
