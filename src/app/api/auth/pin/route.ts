import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { PIN_COOKIE_NAME, isPinTokenValid, pinCookieOptions, pinTokenFor } from "@/lib/pin-session";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/) });

/**
 * Create or change the parent PIN.
 *
 *  - No PIN set yet → create it. This is the create-at-gate flow, which runs
 *    while the session is still locked; there's no existing PIN to protect.
 *  - PIN already set → overwriting requires an already-UNLOCKED session — the
 *    same bar as changing a password requires being logged in. A locked session
 *    (e.g. a child at the gate) can't take this path; a forgotten PIN is reset
 *    via the emailed link (/api/auth/pin/reset), never here. This is what stops
 *    a locked child from blind-overwriting the PIN.
 *
 * Either way it (re)sets the unlock cookie, so the session ends up unlocked.
 *
 * allowUnverified: the create case runs while still locked; the change case
 * enforces the unlock requirement explicitly below.
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

  const { data: claimsData } = await supabase.auth.getClaims();
  const sessionId = claimsData?.claims.session_id;
  const cookieStore = await cookies();

  if (hasPin) {
    const unlocked =
      !!sessionId &&
      (await isPinTokenValid(cookieStore.get(PIN_COOKIE_NAME)?.value, user.id, sessionId));
    if (!unlocked) {
      return NextResponse.json(
        { error: "Unlock required to change the PIN", code: "PIN_LOCKED" },
        { status: 403 },
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
  if (sessionId) {
    const token = await pinTokenFor(user.id, sessionId);
    cookieStore.set(PIN_COOKIE_NAME, token, pinCookieOptions());
  }

  return NextResponse.json({ success: true });
}
