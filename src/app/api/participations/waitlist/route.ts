import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const result = await requireRole("customer", {
    forbiddenMessage: "Only customers can join a waitlist",
  });
  if (result instanceof NextResponse) return result;
  const { user } = result;

  let body: { productId?: string; gamerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { productId, gamerId } = body;
  if (!productId || !gamerId) {
    return NextResponse.json(
      { error: "productId and gamerId are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("join_waitlist", {
    p_product_id: productId,
    p_gamer_id: gamerId,
    p_customer_id: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const json = data as {
    participation_id: string;
    waitlist_position: number;
    status: string;
  };

  return NextResponse.json({
    participationId: json.participation_id,
    waitlistPosition: json.waitlist_position,
    status: json.status,
  });
}
