import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const result = await requireRole("admin", {
      forbiddenMessage: "Only admins can adjust token balances",
    });
    if (result instanceof NextResponse) return result;
    const { user } = result;

    const { userId, amount, description } = await request.json();

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    if (!amount || typeof amount !== "number" || amount === 0) {
      return NextResponse.json(
        { error: "amount must be a non-zero number" },
        { status: 400 }
      );
    }

    if (!description || typeof description !== "string") {
      return NextResponse.json(
        { error: "description is required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data, error } = await admin.rpc("adjust_token_balance", {
      p_user_id: userId,
      p_amount: amount,
      p_type: "admin_adjustment" as const,
      p_description: description,
      p_admin_id: user.id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rpcResult = data[0];
    return NextResponse.json({
      newBalance: rpcResult.new_balance,
      transactionId: rpcResult.transaction_id,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
