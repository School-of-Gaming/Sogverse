import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GroupsService, type BatchGroupChanges } from "@/services/groups";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can manage product groups",
    });
    if (result instanceof NextResponse) return result;

    const { id: productId } = await params;
    const body: BatchGroupChanges = await request.json();
    const { addedGroups, updatedGroups, deletedGroupIds, enrollmentMoves } = body;

    const admin = createAdminClient();

    // Verify product exists (return a clean 404 before hitting the RPC)
    const { data: product, error: productError } = await admin
      .from("products")
      .select("id")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Execute all changes atomically via RPC — if any step fails the
    // entire transaction rolls back, preventing inconsistent state.
    const { data: rpcResult, error: rpcError } = await admin.rpc(
      "commit_group_changes",
      {
        p_product_id: productId,
        p_added_groups: addedGroups,
        p_updated_groups: updatedGroups,
        p_deleted_group_ids: deletedGroupIds,
        p_enrollment_moves: enrollmentMoves,
      },
    );

    if (rpcError) {
      return NextResponse.json(
        { error: rpcError.message },
        { status: 400 },
      );
    }

    // Return refreshed group list
    const service = new GroupsService(admin);
    const groups = await service.getProductGroups(productId);

    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
