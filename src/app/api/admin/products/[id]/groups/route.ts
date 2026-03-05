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
    const { data: product, error: productError } = await admin
      .from("products")
      .select("id")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Before RPC: look up daily_room_name for groups being deleted
    // (needed because CASCADE will remove the voice_rooms rows)
    const deletedRoomNames: string[] = [];
    if (deletedGroupIds && deletedGroupIds.length > 0) {
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

    // Execute all changes atomically via RPC — if any step fails the
    // entire transaction rolls back, preventing inconsistent state.
    const { error: rpcError } = await admin.rpc(
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

    // After RPC: Create voice rooms for new groups that don't have one yet
    const { data: allGroups } = await admin
      .from("product_groups")
      .select("id")
      .eq("product_id", productId);

    if (allGroups) {
      const { data: existingVoiceRooms } = await admin
        .from("voice_rooms")
        .select("group_id")
        .in("group_id", allGroups.map((g) => g.id));

      const existingGroupIds = new Set(
        existingVoiceRooms?.map((vr) => vr.group_id) ?? [],
      );

      // Get product name for the voice room name
      const { data: prod } = await admin
        .from("products")
        .select("name")
        .eq("id", productId)
        .single();

      for (const group of allGroups) {
        if (!existingGroupIds.has(group.id)) {
          const dailyRoomName = `group-${group.id.slice(0, 8)}`;
          try {
            await createDailyRoom({ name: dailyRoomName });
          } catch (err) {
            // Non-fatal: token endpoint will lazily create the Daily.co room
            console.error(`Failed to create Daily.co room ${dailyRoomName}:`, err);
          }
          await admin.from("voice_rooms").insert({
            group_id: group.id,
            room_type: "group",
            name: prod?.name ?? "Voice Room",
            daily_room_name: dailyRoomName,
          });
        }
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
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
