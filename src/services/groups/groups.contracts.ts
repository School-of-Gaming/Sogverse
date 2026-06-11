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

const groupParticipationDetail = z.object({
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
});

/**
 * The `get_product_groups_with_details` JSONB document backing the admin
 * Groups panel. The RPC returns `Json`; this schema is the structure,
 * written from the function body in supabase/schema.sql and re-verified
 * against real Postgres by the db tests that parse through it.
 */
export const productGroupsSnapshot = z.object({
  product_id: z.string(),
  groups: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      created_at: z.string(),
      gedus: z.array(
        z.object({
          id: z.string(),
          first_name: z.string(),
          email: z.string().nullable(),
        })
      ),
      participations: z.array(groupParticipationDetail),
    })
  ),
  unassigned: z.array(groupParticipationDetail),
});
