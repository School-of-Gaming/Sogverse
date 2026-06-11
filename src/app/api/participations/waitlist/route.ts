import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  joinWaitlistBody,
  joinWaitlistRpcResult,
} from "@/services/participations/participations.contracts";

export async function POST(request: Request) {
  const result = await requireRole("customer", {
    forbiddenMessage: "Only customers can join a waitlist",
  });
  if (result instanceof NextResponse) return result;
  const { user } = result;

  const body = await parseJsonBody(request, joinWaitlistBody);
  if (body instanceof NextResponse) return body;
  const { productId, gamerId } = body;

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("join_waitlist", {
    p_product_id: productId,
    p_gamer_id: gamerId,
    p_customer_id: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const parsed = joinWaitlistRpcResult.safeParse(data);
  if (!parsed.success) {
    console.error("join_waitlist returned an unexpected shape:", parsed.error);
    return NextResponse.json(
      { error: "Failed to join waitlist" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    participationId: parsed.data.participation_id,
    waitlistPosition: parsed.data.waitlist_position,
    status: parsed.data.status,
  });
}
