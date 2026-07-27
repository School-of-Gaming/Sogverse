import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import {
  joinWaitlistBody,
  joinWaitlistRpcResult,
} from "@/services/participations/participations.contracts";

/**
 * POST /api/participations/waitlist
 *
 * Model C: the user-bound client calls a guarded SECURITY DEFINER RPC. The
 * caller's identity is not a parameter — `join_product_waitlist` reads it from
 * `auth.uid()` — so this handler cannot waitlist anyone on behalf of anyone
 * else, and the RPC's own guard refuses a non-customer even if this route's
 * role check were bypassed.
 */
export async function POST(request: Request) {
  const result = await requireRole("customer", {
    forbiddenMessage: "Only customers can join a waitlist",
  });
  if (result instanceof NextResponse) return result;
  const { supabase } = result;

  const body = await parseJsonBody(request, joinWaitlistBody);
  if (body instanceof NextResponse) return body;
  const { productId, gamerId } = body;

  const { data, error } = await supabase.rpc("join_product_waitlist", {
    p_product_id: productId,
    p_gamer_id: gamerId,
  });

  if (error) {
    // The RPC raises the canonical forbidden code when the caller is not a
    // customer; everything else it raises (missing product, not the gamer's
    // parent, waitlist disabled) is a request the customer may make but that
    // this data refuses.
    const status = error.code === "42501" ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  const parsed = joinWaitlistRpcResult.safeParse(data);
  if (!parsed.success) {
    console.error(
      "join_product_waitlist returned an unexpected shape:",
      parsed.error.message,
    );
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
