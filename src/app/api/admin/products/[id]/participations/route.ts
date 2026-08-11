import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import {
  adminEnrollGamerBody,
  adminEnrollGamerRpcResult,
} from "@/services/participations/participations.contracts";

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
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can add gamers directly to a product",
  params: z.object({ id: z.string().uuid() }),
  body: adminEnrollGamerBody,

  // Every code this RPC raises already lands where this route used to put it:
  // the already-enrolled unique violation on 409, the guard's refusal on 403,
  // and `no_data_found` on 404. That last one is the per-route decision — the
  // product is named by the URL path, so "the product does not exist" is a
  // missing resource rather than a malformed field, and the shared 404 is
  // right. What changes is the fall-through: an unrecognized code used to be
  // reported to the admin as a 400 carrying raw Postgres text, and is now a
  // logged 500, because an error nobody anticipated is a server error.

  handler: async ({ supabase, user, params, body }) => {
    const { data, error } = await supabase.rpc("admin_enroll_gamer", {
      p_product_id: params.id,
      p_participant_id: body.participantId,
    });

    if (error) {
      // The one code carrying copy the admin needs: the shared table's bare
      // "Conflict" would not tell them the gamer is already on the product.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This gamer is already enrolled on the product" },
          { status: 409 },
        );
      }
      throw error;
    }

    const parsed = adminEnrollGamerRpcResult.safeParse(data);
    if (!parsed.success) {
      console.error(
        "admin_enroll_gamer returned an unexpected shape:",
        parsed.error.message,
      );
      throw new ApiError("Failed to enroll gamer", 500);
    }

    // Audit log line — there's no audit column on participations per the product
    // spec, but a server-side trail is necessary so we can answer "which admin
    // comped this gamer onto this product?" later. Hosted log aggregation picks
    // this up; no DB write.
    console.info(
      JSON.stringify({
        event: "admin_add_gamer",
        admin_id: user.id,
        product_id: params.id,
        participant_id: body.participantId,
        customer_id: parsed.data.customer_id,
        participation_id: parsed.data.participation_id,
        at: new Date().toISOString(),
      }),
    );

    return { participation_id: parsed.data.participation_id };
  },
});
