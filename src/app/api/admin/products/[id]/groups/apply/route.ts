import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import type { BatchGroupChanges } from "@/services/groups";

/**
 * POST /api/admin/products/[id]/groups/apply
 *
 * Applies a batch of staged group changes via the commit_group_changes RPC.
 * The RPC handles atomicity, locks the product row, and resolves temp ids for
 * groups created in the same batch.
 *
 * Email notifications + Daily.co room provisioning are intentionally NOT done
 * here. The v1 route at api/admin/products/[id]/groups/apply/route.ts wires
 * those up; that code stays available for future reuse on the v2 surface.
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

  let batch: BatchGroupChanges;
  try {
    batch = (await request.json()) as BatchGroupChanges;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("commit_group_changes", {
    p_product_id: productId,
    p_added_groups: batch.addedGroups,
    p_renamed_groups: batch.renamedGroups,
    p_deleted_group_ids: batch.deletedGroupIds,
    p_gedu_assignments_added: batch.geduAssignmentsAdded,
    p_gedu_assignments_removed: batch.geduAssignmentsRemoved,
    p_participation_moves: batch.participationMoves,
  });

  if (error) {
    // P0002 = product not found; surface as 404. Everything else is a 400
    // (constraint violation, malformed batch) — the RPC raises with a
    // descriptive message so we forward it.
    const status = error.code === "P0002" ? 404 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data as { tempMap: Record<string, string> });
}
