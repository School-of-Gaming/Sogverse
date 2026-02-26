import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNextSessionStart } from "@/lib/enrollment";

export async function POST(request: Request) {
  try {
    const result = await requireRole("customer", {
      forbiddenMessage: "Only customers can enroll gamers",
    });
    if (result instanceof NextResponse) return result;
    const { user } = result;

    const { gamerId, groupId } = await request.json();

    if (!gamerId || typeof gamerId !== "string") {
      return NextResponse.json({ error: "gamerId is required" }, { status: 400 });
    }

    if (!groupId || typeof groupId !== "string") {
      return NextResponse.json({ error: "groupId is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Look up the product via the group to get schedule info for session date
    const { data: group, error: groupError } = await admin
      .from("product_groups")
      .select("product_id, products(day_of_week, start_time, timezone)")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const product = group.products as {
      day_of_week: number;
      start_time: string;
      timezone: string;
    };

    // Compute the next session date for the first charge
    const nextSession = getNextSessionStart(
      product.day_of_week,
      product.start_time,
      product.timezone,
    );
    // Format as YYYY-MM-DD for the SQL DATE parameter
    const sessionDate = nextSession.toISOString().split("T")[0];

    const { data, error } = await admin.rpc("enroll_gamer_in_group", {
      p_customer_id: user.id,
      p_gamer_id: gamerId,
      p_group_id: groupId,
      p_session_date: sessionDate,
    });

    if (error) {
      // Check for insufficient balance (CHECK constraint violation)
      if (error.code === "23514") {
        return NextResponse.json(
          { error: "Insufficient token balance" },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rpcResult = data?.[0];
    return NextResponse.json({
      enrollmentId: rpcResult?.enrollment_id,
      newBalance: rpcResult?.new_balance,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
