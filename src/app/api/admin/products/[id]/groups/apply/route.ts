import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
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
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can manage product groups",
  });
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  const { id: productId } = await params;

  const changes = await parseJsonBody(request, groupChangeSet);
  if (changes instanceof NextResponse) return changes;

  const { data, error } = await supabase.rpc("apply_group_changes", {
    p_product_id: productId,
    p_added_groups: changes.addedGroups,
    p_renamed_groups: changes.renamedGroups,
    p_deleted_group_ids: changes.deletedGroupIds,
    p_gedu_assignments_added: changes.geduAssignmentsAdded,
    p_gedu_assignments_removed: changes.geduAssignmentsRemoved,
    p_participation_moves: changes.participationMoves,
  });

  if (error) {
    // P0002 = product not found; surface as 404. Everything else is a 400
    // (constraint violation, malformed batch) — the RPC raises with a
    // descriptive message so we forward it.
    const status = error.code === "P0002" ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  // The RPC returns `Json`; validate it really is the tempMap shape before
  // handing it to the client (the service parses the same contract schema).
  return NextResponse.json(applyGroupChangesResult.parse(data));
}
