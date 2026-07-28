import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { defineRoute } from "@/lib/api/define-route";
import { pinBody } from "@/services/pin/pin.contracts";
import {
  PIN_COOKIE_NAME,
  isPinTokenValid,
  pinCookieOptions,
  pinTokenFor,
} from "@/lib/pin-session";

/**
 * Create or change the parent PIN.
 *
 *  - No PIN set yet → create it. This is the create-at-gate flow, which runs
 *    while the session is still locked; there's no existing PIN to protect.
 *  - PIN already set → overwriting requires an already-UNLOCKED session — the
 *    same bar as changing a password requires being logged in. A locked session
 *    (e.g. a child at the gate) can't take this path; a forgotten PIN is reset
 *    via the emailed link, never here. This is what stops a locked child from
 *    blind-overwriting the PIN.
 *
 * Either way it (re)sets the unlock cookie, so the session ends up unlocked.
 *
 * allowUnverified: the create case runs while still locked; the change case
 * enforces the unlock requirement explicitly below.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  allowUnverified: true,
  body: pinBody,

  // No database codes to map: both RPCs are self-scoping and their only
  // interesting failure is "it did not work", which the shared table answers
  // as a logged, generic 500.

  handler: async ({ supabase, user, body }) => {
    const { data: hasPin, error: hasPinError } = await supabase.rpc("pin_is_set");
    if (hasPinError) throw hasPinError;

    const { data: claimsData } = await supabase.auth.getClaims();
    const sessionId = claimsData?.claims.session_id;
    const cookieStore = await cookies();

    if (hasPin) {
      const unlocked =
        !!sessionId &&
        (await isPinTokenValid(
          cookieStore.get(PIN_COOKIE_NAME)?.value,
          user.id,
          sessionId,
        ));
      if (!unlocked) {
        return NextResponse.json(
          { error: "Unlock required to change the PIN", code: "PIN_LOCKED" },
          { status: 403 },
        );
      }
    }

    const { error: setError } = await supabase.rpc("set_my_pin", {
      p_pin: body.pin,
    });
    if (setError) throw setError;

    // Setting a PIN also unlocks the current session (covers create-at-gate and
    // keeps the settings session unlocked after a change).
    if (sessionId) {
      cookieStore.set(
        PIN_COOKIE_NAME,
        await pinTokenFor(user.id, sessionId),
        pinCookieOptions(),
      );
    }

    return { success: true };
  },
});
