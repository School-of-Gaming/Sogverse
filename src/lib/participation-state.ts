import type { Participation, ParticipationState } from "@/types";

/**
 * Resolve a participation row's placement state. See
 * docs/products-architecture.md §3 "Participation state vocabulary".
 *
 * Parents never see these labels directly — `unassigned` and `assigned`
 * both render as "Confirmed" today. The split exists for admin surfaces
 * and for the detail-line copy (assigned shows the next session date,
 * unassigned reads "we'll set up your group").
 */
export function participationStateOf(
  p: Pick<Participation, "status" | "group_id">,
): ParticipationState {
  if (p.status === "waitlisted") return "waitlisted";
  if (p.group_id === null) return "unassigned";
  return "assigned";
}
