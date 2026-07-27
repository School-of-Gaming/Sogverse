import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import {
  applyGroupChangesResult,
  groupChangeSet,
} from "@/services/groups/groups.contracts";

/**
 * POST /api/admin/products/[id]/groups/apply
 *
 * Applies a group change set via the apply_group_changes RPC. The admin panel
 * auto-saves each action as a single-change set; the RPC still handles
 * atomicity, locks the product row, and resolves temp ids for a group created
 * in the same set.
 *
 * Email notifications + Daily.co room provisioning are intentionally NOT done
 * here. The legacy provisioning logic wires those up and stays available for
 * future reuse.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can manage product groups",
  params: z.object({ id: z.string().uuid() }),
  body: groupChangeSet,

  // `no_data_found`: the RPC raises it for a product that is not there, and the
  // product is named by the URL path — a missing one is a missing resource, so
  // the shared table's 404 stands and no override is needed. Every other code
  // the RPC can raise (constraint violations from a malformed batch) also lands
  // on the shared table; this route used to collapse all of them to 400.
  discloseErrorMessages:
    "apply_group_changes raises with a written explanation of which change in the batch was refused, and the groups panel shows it verbatim beside the failed action",

  handler: async ({ supabase, params, body }) => {
    const { data, error } = await supabase.rpc("apply_group_changes", {
      p_product_id: params.id,
      p_added_groups: body.addedGroups,
      p_renamed_groups: body.renamedGroups,
      p_deleted_group_ids: body.deletedGroupIds,
      p_gedu_assignments_added: body.geduAssignmentsAdded,
      p_gedu_assignments_removed: body.geduAssignmentsRemoved,
      p_participation_moves: body.participationMoves,
    });

    if (error) throw error;

    // The RPC is typed `Json` by codegen, so the contract schema is what
    // narrows it. A mismatch is our bug, not the caller's: a logged 500. The
    // zod detail goes to the log rather than into the ApiError, because this
    // route discloses its error messages and that detail is not admin copy.
    const parsed = applyGroupChangesResult.safeParse(data);
    if (!parsed.success) {
      console.error(
        "apply_group_changes returned an unexpected shape:",
        parsed.error.message,
      );
      throw new ApiError("Failed to apply group changes", 500);
    }
    return parsed.data;
  },
});
