import { cookies } from "next/headers";
import { defineRoute } from "@/lib/api/define-route";
import { pinStatusResponse } from "@/services/pin/pin.contracts";
import { PIN_COOKIE_NAME, isPinTokenValid } from "@/lib/pin-session";

/**
 * Report the caller's parent-PIN state: whether a PIN exists (`isSet`) and
 * whether THIS session is currently unlocked (`unlocked`). The unlock bit lives
 * in an HttpOnly cookie the browser can't read, so any client that needs to gate
 * UI on unlock state (e.g. the Add Gamer dialog) asks here.
 *
 * allowUnverified: a LOCKED customer must be able to query this — it's how the
 * gate decides whether to show the create/enter pad in the first place.
 */
export const GET = defineRoute({
  posture: "role-gated",
  roles: "customer",
  allowUnverified: true,
  response: pinStatusResponse,

  handler: async ({ supabase, user }) => {
    const { data: isSet, error } = await supabase.rpc("pin_is_set");
    if (error) throw error;

    const { data: claimsData } = await supabase.auth.getClaims();
    const sessionId = claimsData?.claims.session_id;
    const unlocked =
      !!sessionId &&
      (await isPinTokenValid(
        (await cookies()).get(PIN_COOKIE_NAME)?.value,
        user.id,
        sessionId,
      ));

    return { isSet, unlocked };
  },
});
