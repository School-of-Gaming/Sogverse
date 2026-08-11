import type { GeduAssignedProductRosterEntry } from "@/types";

/**
 * Convenience alias for the roster row shape consumed by
 * `ParticipantRosterRow` and the workspace rail. The RPC already returns
 * exactly this — the alias is just a shorter import for the components.
 */
export type ParticipantSessionRow = GeduAssignedProductRosterEntry;

/**
 * The one address a gedu can actually write to for this seat.
 *
 * The RPC emits exactly one of the two contact fields per row and never both:
 * `parent_email` for a child (their linked parent) and `participant_email` for
 * an adult (their own address). A child's *own* profile email is the synthetic
 * `@gamer.sogverse.internal` handle and is deliberately not emitted at all, so
 * there is no shape in which this returns a non-mailbox.
 *
 * It lives here rather than inside the row component because the bulk
 * copy-all affordance above the list has to make the identical choice, and two
 * places deciding "which address" independently is how one of them ends up
 * omitting every adult from the pasted list.
 */
export function rosterContactEmail(
  entry: ParticipantSessionRow,
): string | null {
  return entry.participant_email ?? entry.parent_email;
}
