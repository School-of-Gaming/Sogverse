import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { GroupsService } from "@/services/groups";

interface BatchPayload {
  addedGroups: Array<{ tempId: string; geduId: string }>;
  updatedGroups: Array<{ groupId: string; geduId: string }>;
  deletedGroupIds: string[];
  enrollmentMoves: Array<{ gamerId: string; fromGroupId: string; toGroupId: string }>;
}

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
    const body: BatchPayload = await request.json();
    const { addedGroups, updatedGroups, deletedGroupIds, enrollmentMoves } = body;

    const admin = createAdminClient();

    // Verify product exists
    const { data: product, error: productError } = await admin
      .from("products")
      .select("id")
      .eq("id", productId)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Build a map of tempId → realId for new groups (resolved after insert)
    const tempIdToRealId = new Map<string, string>();

    // Compute next display_order
    const { data: existingGroups } = await admin
      .from("product_groups")
      .select("display_order")
      .eq("product_id", productId)
      .order("display_order", { ascending: false })
      .limit(1);

    let nextOrder = (existingGroups?.[0]?.display_order ?? -1) + 1;

    // Step 1: Delete enrollment moves from source groups
    for (const move of enrollmentMoves) {
      const realFromId = tempIdToRealId.get(move.fromGroupId) ?? move.fromGroupId;
      const { error } = await admin
        .from("group_enrollments")
        .delete()
        .eq("group_id", realFromId)
        .eq("gamer_id", move.gamerId);

      if (error) {
        return NextResponse.json(
          { error: `Failed to remove enrollment: ${error.message}` },
          { status: 400 },
        );
      }
    }

    // Step 2: Delete groups (only works if enrollments were moved out)
    for (const groupId of deletedGroupIds) {
      const { error } = await admin
        .from("product_groups")
        .delete()
        .eq("id", groupId);

      if (error) {
        return NextResponse.json(
          { error: `Failed to delete group: ${error.message}` },
          { status: 400 },
        );
      }
    }

    // Step 3: Insert new groups (map tempId → realId)
    for (const group of addedGroups) {
      const { data: newGroup, error } = await admin
        .from("product_groups")
        .insert({
          product_id: productId,
          gedu_id: group.geduId,
          display_order: nextOrder++,
        })
        .select("id")
        .single();

      if (error) {
        return NextResponse.json(
          { error: `Failed to add group: ${error.message}` },
          { status: 400 },
        );
      }

      tempIdToRealId.set(group.tempId, newGroup.id);
    }

    // Step 4: Update existing groups (change gedu_id)
    for (const group of updatedGroups) {
      const { error } = await admin
        .from("product_groups")
        .update({ gedu_id: group.geduId, updated_at: new Date().toISOString() })
        .eq("id", group.groupId);

      if (error) {
        return NextResponse.json(
          { error: `Failed to update group: ${error.message}` },
          { status: 400 },
        );
      }
    }

    // Step 5: Insert enrollment moves into destination groups (resolve tempIds)
    for (const move of enrollmentMoves) {
      const realToId = tempIdToRealId.get(move.toGroupId) ?? move.toGroupId;
      const { error } = await admin
        .from("group_enrollments")
        .insert({
          group_id: realToId,
          gamer_id: move.gamerId,
        });

      if (error) {
        return NextResponse.json(
          { error: `Failed to move enrollment: ${error.message}` },
          { status: 400 },
        );
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
