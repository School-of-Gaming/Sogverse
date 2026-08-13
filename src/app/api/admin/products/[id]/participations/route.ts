import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import {
  adminEnrollParticipantBody,
  adminEnrollParticipantRpcResult,
} from "@/services/participations/participations.contracts";

/**
 * POST /api/admin/products/[id]/participations
 *
 * Admin-only comp-enrollment: drops a participant directly into a product with
 * status='active', bypassing payment, seat caps, registration windows, and
 * effective-status gates. The participant is a child or — since 00173, on a
 * for-parents product — an adult taking a seat on their own account.
 *
 * Model C. `participations` is grant-locked — `authenticated` holds SELECT and
 * nothing else, because a stray write there is a free seat — so this runs on the
 * user-bound client through `admin_enroll_participant`, a SECURITY DEFINER RPC
 * whose first statement is the admin guard. The rules that survive the override
 * (product exists, subscription-billed consumer clubs out of scope, the product's
 * audience, and a child needing a linked parent to attribute the participation
 * to) live in the RPC rather than here, so they hold for any admin calling it,
 * not only for requests that came through this handler.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can add participants directly to a product",
  params: z.object({ id: z.string().uuid() }),
  body: adminEnrollParticipantBody,

  // Every code this RPC raises already lands where this route used to put it:
  // the already-enrolled unique violation on 409, the guard's refusal on 403,
  // and `no_data_found` on 404. That last one is the per-route decision — the
  // product is named by the URL path, so "the product does not exist" is a
  // missing resource rather than a malformed field, and the shared 404 is
  // right. What changes is the fall-through: an unrecognized code used to be
  // reported to the admin as a 400 carrying raw Postgres text, and is now a
  // logged 500, because an error nobody anticipated is a server error.

  handler: async ({ supabase, user, params, body }) => {
    const { data, error } = await supabase.rpc("admin_enroll_participant", {
      p_product_id: params.id,
      p_participant_id: body.participantId,
    });

    if (error) {
      // The one code carrying copy the admin needs: the shared table's bare
      // "Conflict" would not tell them this person is already on the product.
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This participant is already enrolled on the product" },
          { status: 409 },
        );
      }
      // The RPC's four deliberate refusals all raise `check_violation`, which
      // the shared table renders as a bare "Invalid request" — true, and useless
      // to an admin who has just clicked Add beside a name and wants to know
      // why. They are translated here rather than passed through, because the
      // raw Postgres text interpolates the product and participant UUIDs and an
      // error message is not the place to leak ids.
      if (error.code === "23514") {
        return NextResponse.json(
          { error: compEnrollRefusal(error.message) },
          { status: 400 },
        );
      }
      throw error;
    }

    const parsed = adminEnrollParticipantRpcResult.safeParse(data);
    if (!parsed.success) {
      console.error(
        "admin_enroll_participant returned an unexpected shape:",
        parsed.error.message,
      );
      throw new ApiError("Failed to enroll participant", 500);
    }

    // Audit log line — there's no audit column on participations per the product
    // spec, but a server-side trail is necessary so we can answer "which admin
    // comped this person onto this product?" later. Hosted log aggregation picks
    // this up; no DB write.
    console.info(
      JSON.stringify({
        event: "admin_add_participant",
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

/**
 * Turn one of `admin_enroll_participant`'s `check_violation` refusals into a
 * sentence the admin can act on.
 *
 * Matched on a distinctive fragment of each RAISE rather than on the whole
 * message, because every one of them interpolates a UUID. The fallback is
 * deliberately vague and deliberately reachable: a refusal this function does
 * not recognise is still a refusal, and saying so beats either echoing Postgres
 * or claiming a 500.
 *
 * These strings live here rather than in `messages/` for the same reason the
 * 409 above does: the whole route answers in English, and the picker renders
 * `error.message` verbatim.
 */
function compEnrollRefusal(message: string): string {
  if (message.includes("not open to parents")) {
    return "This product is not open to parents — tick For parents on it first, or pick a child instead.";
  }
  if (message.includes("not open to gamers")) {
    return "This product is not open to gamers — it is for parents only, so pick the parent instead.";
  }
  if (message.includes("has no linked parent")) {
    return "This gamer has no linked parent, so there is nobody to attribute the seat to.";
  }
  if (message.includes("subscription-billed consumer clubs")) {
    return "A subscription-billed club cannot be comp-enrolled — its seat needs a Stripe subscription this cannot create.";
  }
  return "This participant cannot be enrolled on this product.";
}
