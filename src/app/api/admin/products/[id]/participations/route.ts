import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import { adminEnrollGamerRpcResult } from "@/services/participations/participations.contracts";

/**
 * POST /api/admin/products/[id]/participations
 *
 * Admin-only comp-enrollment: drops a gamer directly into a product with
 * status='active', bypassing payment, seat caps, registration windows, and
 * effective-status gates.
 *
 * Model C. `participations` is grant-locked — `authenticated` holds SELECT and
 * nothing else, because a stray write there is a free seat — so this runs on the
 * user-bound client through `admin_enroll_gamer`, a SECURITY DEFINER RPC whose
 * first statement is the admin guard. The rules that survive the override
 * (product exists, consumer clubs out of scope, the gamer needs a linked parent
 * to attribute the participation to) live in the RPC rather than here, so they
 * hold for any admin calling it, not only for requests that came through this
 * handler.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can add gamers directly to a product",
  });
  if (result instanceof NextResponse) return result;
  const { supabase, user } = result;

  const { id: productId } = await params;

  const body = await parseJsonBody(
    request,
    z.object({ gamerId: z.string().min(1, "gamerId is required") }),
  );
  if (body instanceof NextResponse) return body;
  const { gamerId } = body;

  const { data, error } = await supabase.rpc("admin_enroll_gamer", {
    p_product_id: productId,
    p_gamer_id: gamerId,
  });

  if (error) {
    // 23505 = the partial unique index on (product_id, gamer_id) for
    // non-reserving statuses fired — the gamer is already enrolled (active,
    // waitlisted, or completed).
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This gamer is already enrolled on the product" },
        { status: 409 },
      );
    }
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "Only admins can add gamers directly to a product" },
        { status: 403 },
      );
    }
    if (error.code === "P0002") {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const parsed = adminEnrollGamerRpcResult.safeParse(data);
  if (!parsed.success) {
    console.error(
      "admin_enroll_gamer returned an unexpected shape:",
      parsed.error.message,
    );
    return NextResponse.json({ error: "Failed to enroll gamer" }, { status: 500 });
  }

  // Audit log line — there's no audit column on participations per the product
  // spec, but a server-side trail is necessary so we can answer "which admin
  // comped this gamer onto this product?" later. Hosted log aggregation picks
  // this up; no DB write.
  console.info(
    JSON.stringify({
      event: "admin_add_gamer",
      admin_id: user.id,
      product_id: productId,
      gamer_id: gamerId,
      customer_id: parsed.data.customer_id,
      participation_id: parsed.data.participation_id,
      at: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ participation_id: parsed.data.participation_id });
}
