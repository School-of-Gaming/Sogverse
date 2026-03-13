import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GroupsService, type BatchGroupChanges } from "@/services/groups";
import { createDailyRoom, deleteDailyRoom } from "@/lib/daily";

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
    const { error: productError } = await admin
      .from("products")
      .select("id")
      .eq("id", productId)
      .single();

    if (productError) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Before RPC: look up daily_room_name for groups being deleted
    // (needed because CASCADE will remove the voice_rooms rows)
    const deletedRoomNames: string[] = [];
    if (deletedGroupIds.length > 0) {
      const { data: roomsToDelete } = await admin
        .from("voice_rooms")
        .select("daily_room_name")
        .in("group_id", deletedGroupIds);
      if (roomsToDelete) {
        for (const r of roomsToDelete) {
          deletedRoomNames.push(r.daily_room_name);
        }
      }
    }

    // Execute all changes atomically via RPC — groups + voice rooms are
    // created together in the same transaction, so a group can never exist
    // without its linked voice room.
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

    // Best-effort: pre-create Daily.co rooms for new groups so the first
    // join is fast. If this fails, the token endpoint will lazily create them.
    const rpcJson = rpcResult as { tempMap?: Record<string, string> } | null;
    const tempMap = rpcJson?.tempMap ?? {};
    for (const realId of Object.values(tempMap)) {
      const dailyRoomName = `group-${realId.slice(0, 8)}`;
      try {
        await createDailyRoom({ name: dailyRoomName });
      } catch (err) {
        console.error(`Failed to pre-create Daily.co room ${dailyRoomName}:`, err);
      }
    }

    // After RPC: Delete Daily.co rooms for deleted groups (best-effort)
    for (const roomName of deletedRoomNames) {
      try {
        await deleteDailyRoom(roomName);
      } catch (err) {
        console.error(`Failed to delete Daily.co room ${roomName}:`, err);
      }
    }

    // Return refreshed group list
    const service = new GroupsService(admin);
    const groups = await service.getProductGroups(productId);

    return NextResponse.json({ groups });
  } catch (err) {
    console.error("groups route error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
