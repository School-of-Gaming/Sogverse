import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { PIN_COOKIE_NAME, pinCookieOptions, pinTokenFor } from "@/lib/pin-session";

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  // Present for the settings "change PIN" flow. Omitted when creating a PIN for
  // the first time (none set yet). It is NOT a way to overwrite an existing PIN
  // without proof — see the guard below.
  currentPin: z.string().regex(/^\d{4}$/).optional(),
});

/**
 * Create or change the parent PIN.
 *
 *  - No PIN set yet → create it (no currentPin needed). This is the only way a
 *    PIN gets set from a session; if a child sets it first, the parent reclaims
 *    it via the email-reset flow (intentional, accepted one-time issue).
 *  - PIN already set → require the current PIN. This is the load-bearing guard:
 *    it stops a LOCKED session (a child at the gate) from blind-overwriting a
 *    PIN it doesn't know. Forgotten PINs go through /api/auth/pin/reset (email),
 *    never here.
 *
 * allowUnverified: the create case runs while the session is still locked.
 */
export async function POST(request: Request) {
  const auth = await requireRole("customer", { allowUnverified: true });
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 400 });
  }

  const { data: hasPin, error: hasPinError } = await supabase.rpc("pin_is_set");
  if (hasPinError) {
    console.error("pin: pin_is_set failed", hasPinError);
    return NextResponse.json({ error: "Failed to set PIN" }, { status: 500 });
  }

  if (hasPin) {
    if (parsed.data.currentPin === undefined) {
      return NextResponse.json(
        { error: "Current PIN required", code: "CURRENT_PIN_REQUIRED" },
        { status: 403 },
      );
    }
    const { data: ok, error: verifyError } = await supabase.rpc("verify_my_pin", {
      p_pin: parsed.data.currentPin,
    });
    if (verifyError) {
      console.error("pin: verify_my_pin failed", verifyError);
      return NextResponse.json({ error: "Failed to set PIN" }, { status: 500 });
    }
    if (!ok) {
      return NextResponse.json(
        { error: "Incorrect current PIN", code: "BAD_CURRENT_PIN" },
        { status: 401 },
      );
    }
  }

  const { error: setError } = await supabase.rpc("set_my_pin", { p_pin: parsed.data.pin });
  if (setError) {
    console.error("pin: set_my_pin failed", setError);
    return NextResponse.json({ error: "Failed to set PIN" }, { status: 500 });
  }

  // Setting a PIN also unlocks the current session (covers create-at-gate and
  // keeps the settings session unlocked after a change).
  const { data: claimsData } = await supabase.auth.getClaims();
  const sessionId = claimsData?.claims.session_id;
  if (sessionId) {
    const token = await pinTokenFor(user.id, sessionId);
    (await cookies()).set(PIN_COOKIE_NAME, token, pinCookieOptions());
  }

  return NextResponse.json({ success: true });
}
