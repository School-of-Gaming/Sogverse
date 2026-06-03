import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseResetTokenUserId, verifyPinResetToken } from "@/lib/pin-session";

/**
 * Resolve a PIN-reset token to the userId it authorizes, or null if it's
 * invalid / expired / already used. Single source of truth for both the
 * `/reset-pin` page (to gate the UI — show the "link expired" notice instead of
 * the PIN pad when the token is dead) and `POST /api/auth/pin/reset` (to gate
 * the actual write).
 *
 * The token is single-use because it's bound to the account's PIN hash at mint
 * time (see pin-session.ts), so verifying needs the account's CURRENT hash. We
 * read it via the admin client (bypasses RLS; the hash never leaves the server)
 * for the userId carried in the token, then verify against it. A token minted
 * before the last reset/change no longer reproduces the signature → null.
 */
export async function resolvePinResetToken(
  token: string | null | undefined,
): Promise<string | null> {
  if (!token) return null;
  const userId = parseResetTokenUserId(token);
  if (!userId) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("customer_profiles")
    .select("pin_hash")
    .eq("user_id", userId)
    .single();

  return verifyPinResetToken(token, data?.pin_hash ?? "", Date.now());
}
