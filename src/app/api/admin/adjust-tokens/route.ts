import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if ((profile as { role: string } | null)?.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can adjust token balances" },
        { status: 403 }
      );
    }

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

    const result = data?.[0];
    return NextResponse.json({
      newBalance: result?.new_balance,
      transactionId: result?.transaction_id,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
