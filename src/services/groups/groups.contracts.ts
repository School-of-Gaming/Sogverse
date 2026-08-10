import { z } from "zod";
import { Constants } from "@/types";

/**
 * Contracts for the admin groups API (the apply route and the admin
 * participation add/remove routes). The route parses its request body with
 * the body schema, and BOTH ends validate the result shape: the route parses
 * the RPC's `Json` return before responding, the service parses the response
 * it receives — so the wire contract is checked where it's produced and
 * where it's consumed.
 */

export const groupChangeSet = z.object({
  addedGroups: z.array(
    z.object({
      tempId: z.string(),
      name: z.string(),
      geduIds: z.array(z.string()),
    })
  ),
  renamedGroups: z.array(z.object({ groupId: z.string(), name: z.string() })),
  deletedGroupIds: z.array(z.string()),
  geduAssignmentsAdded: z.array(
    z.object({ groupId: z.string(), geduId: z.string() })
  ),
  geduAssignmentsRemoved: z.array(
    z.object({ groupId: z.string(), geduId: z.string() })
  ),
  participationMoves: z.array(
    z.object({
      participationId: z.string(),
      /** null = unassign (back to inbox); a tempId resolves via the new-group map */
      toGroupId: z.string().nullable(),
    })
  ),
});

export type GroupChangeSet = z.infer<typeof groupChangeSet>;

/** `apply_group_changes` result: throwaway tempId → persisted group UUID. */
export const applyGroupChangesResult = z.object({
  tempMap: z.record(z.string()),
});

export type ApplyGroupChangesResult = z.infer<typeof applyGroupChangesResult>;

/** Response of POST /api/admin/products/[id]/participations (comp-enrollment). */
export const addParticipationResponse = z.object({
  participation_id: z.string(),
});

export const groupParticipationDetail = z.object({
  id: z.string(),
  gamer_id: z.string(),
  gamer_first_name: z.string(),
  gamer_date_of_birth: z.string().nullable(),
  gamer_gender: z.enum(Constants.public.Enums.gender_type).nullable(),
  gamer_minecraft_username: z.string().nullable(),
  gamer_minecraft_uuid: z.string().nullable(),
  gamer_parent_first_name: z.string().nullable(),
  gamer_parent_last_name: z.string().nullable(),
  status: z.enum(Constants.public.Enums.participation_status),
  signed_up_at: z.string(),
  /**
   * Whether this participation has a live Stripe subscription behind it —
   * the condition `demote_to_waitlist` refuses on, resolved server-side so the
   * panel's demote dialog can fire from the drag handler without a round trip
   * per chip. Required on every participation object, including waitlisted
   * ones, where it is a constant false: the RPC refuses to create a waitlisted
   * row carrying a subscription, so there is nothing there to report.
   */
  has_live_subscription: z.boolean(),
  /**
   * Whether money ever arrived for this participation — the recorded Stripe
   * Checkout Session id being non-null. It is a statement about the past, not
   * about the seat being currently paid for: demotion to the waitlist
   * preserves it, so a family that paid and was later demoted still reads
   * true, while one that only ever joined the queue has no session id and
   * reads false. That difference is the promote dialog's condition on a paid
   * product.
   */
  has_payment_marker: z.boolean(),
});

export const groupGeduDetail = z.object({
  id: z.string(),
  first_name: z.string(),
  email: z.string().nullable(),
});

export const productGroupWithDetails = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  gedus: z.array(groupGeduDetail),
  participations: z.array(groupParticipationDetail),
});

/**
 * The `get_product_groups_with_details` JSONB document backing the admin
 * Groups panel. The RPC returns `Json`; this schema is the structure,
 * written from the function body in supabase/schema.sql and re-verified
 * against real Postgres by the db tests that parse through it.
 */
export const productGroupsSnapshot = z.object({
  product_id: z.string(),
  groups: z.array(productGroupWithDetails),
  unassigned: z.array(groupParticipationDetail),
  /**
   * Waitlisted gamers in derived order (waitlisted_at, id) — same detail shape
   * as a group/unassigned chip. Waitlist position is the array index + 1,
   * computed in the UI; it is never stored. See migration 00118.
   */
  waitlist: z.array(groupParticipationDetail),
});

/**
 * The compile-time shapes for the Groups panel, derived from the schemas above
 * so the wire contract and the type can't drift. Re-exported through `@/types`
 * (see types/index.ts) so consumers keep a single import surface.
 */
export type GroupParticipationDetail = z.infer<typeof groupParticipationDetail>;
export type GroupGeduDetail = z.infer<typeof groupGeduDetail>;
export type ProductGroupWithDetails = z.infer<typeof productGroupWithDetails>;
export type ProductGroupsSnapshot = z.infer<typeof productGroupsSnapshot>;
