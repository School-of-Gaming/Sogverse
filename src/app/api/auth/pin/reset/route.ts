import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPinResetToken } from "@/lib/pin-session";

const schema = z.object({
  token: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/),
});

/**
 * Complete a PIN reset from the emailed link. Public and session-agnostic: the
 * signed token IS the authorization (it was delivered to the parent's inbox).
 * Sets the PIN via the admin-only set_pin_for_user RPC — the only path that can
 * overwrite a PIN without proving the current one, and unreachable from a
 * locked child session because the token can't be obtained without the inbox.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const userId = await verifyPinResetToken(parsed.data.token, Date.now());
  if (!userId) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_pin_for_user", {
    p_user_id: userId,
    p_pin: parsed.data.pin,
  });
  if (error) {
    console.error("pin/reset: set_pin_for_user failed", error);
    return NextResponse.json({ error: "Failed to reset PIN" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
