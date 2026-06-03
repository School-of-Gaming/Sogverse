import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireRole } from "@/lib/auth";
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
export async function GET() {
  const auth = await requireRole("customer", { allowUnverified: true });
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { data: isSet, error } = await supabase.rpc("pin_is_set");
  if (error) {
    console.error("pin/status: pin_is_set failed", error);
    return NextResponse.json({ error: "Failed to load PIN status" }, { status: 500 });
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const sessionId = claimsData?.claims.session_id;
  const unlocked =
    !!sessionId &&
    (await isPinTokenValid((await cookies()).get(PIN_COOKIE_NAME)?.value, user.id, sessionId));

  return NextResponse.json({ isSet, unlocked });
}
