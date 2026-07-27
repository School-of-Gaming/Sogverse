import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { defineRoute } from "@/lib/api/define-route";
import { pinBody, pinVerifyResponse } from "@/services/pin/pin.contracts";
import {
  PIN_COOKIE_NAME,
  pinCookieOptions,
  pinTokenFor,
} from "@/lib/pin-session";

/**
 * Verify the parent PIN and unlock the session. allowUnverified: this is the
 * route a locked customer calls to BECOME unlocked, so it must not be gated.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  allowUnverified: true,
  body: pinBody,
  response: pinVerifyResponse,

  handler: async ({ supabase, user, body }) => {
    const { data: ok, error } = await supabase.rpc("verify_my_pin", {
      p_pin: body.pin,
    });
    if (error) throw error;

    // A wrong PIN is a normal outcome, not an auth failure (the session is
    // valid — the role gate already passed), so it's a 200 with
    // verified:false rather than a 401. That keeps an expected wrong guess out
    // of the browser's error console and out of network-error monitoring; a
    // real 401 then means the session itself failed.
    if (!ok) return { verified: false };

    const { data: claimsData } = await supabase.auth.getClaims();
    const sessionId = claimsData?.claims.session_id;
    if (!sessionId) {
      return NextResponse.json({ error: "No active session" }, { status: 401 });
    }

    (await cookies()).set(
      PIN_COOKIE_NAME,
      await pinTokenFor(user.id, sessionId),
      pinCookieOptions(),
    );

    return { verified: true };
  },
});
