import { z } from "zod";

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
