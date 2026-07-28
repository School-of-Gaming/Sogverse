import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
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
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  forbiddenMessage: "Only customers can join a waitlist",
  body: joinWaitlistBody,

  // The RPC raises the canonical forbidden code when the caller is not a
  // customer, and a check violation for a request the customer may make but
  // that this data refuses (waitlist disabled, not the gamer's parent) — both
  // already land on the shared table. `no_data_found` is the exception: the
  // RPC raises it for a product that does not exist, which the client treats
  // as bad input rather than a missing endpoint, so it stays a 400 here.
  errorStatus: { P0002: 400 },

  // The RPC's messages are written for the parent to read — "waitlist is not
  // enabled for this product", "product … does not exist" — and the UI shows
  // them verbatim. They name no row the caller was not already holding.
  discloseErrorMessages:
    "the guarded RPC's messages are the user-facing explanation of a refused join",

  handler: async ({ supabase, body }) => {
    const { data, error } = await supabase.rpc("join_product_waitlist", {
      p_product_id: body.productId,
      p_gamer_id: body.gamerId,
    });

    if (error) throw error;

    const parsed = joinWaitlistRpcResult.safeParse(data);
    if (!parsed.success) {
      throw new ApiError(
        `join_product_waitlist returned an unexpected shape: ${parsed.error.message}`,
        500,
      );
    }

    return {
      participationId: parsed.data.participation_id,
      waitlistPosition: parsed.data.waitlist_position,
      status: parsed.data.status,
    };
  },
});
