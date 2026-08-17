import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseEmailVerificationTokenUserId,
  verifyEmailVerificationToken,
} from "@/lib/email-verification";

/**
 * Redeem an emailed verification token: check it, and stamp
 * `profiles.email_verified_at` if it holds.
 *
 * Session-agnostic by construction — the token is the authorization, so the
 * whole read/verify/write runs on the admin client (`email_verified_at` has no
 * write grant to anyone else, and the reader may not be signed in at all, or
 * may be signed in as somebody else entirely on a shared device).
 *
 * The order matters: the token is bound to the address the profile holds *now*
 * (see `email-verification.ts`), so the current email has to be read before the
 * signature can be checked. A profile that no longer exists, or holds a
 * different address than the link was minted for, comes back `"invalid"`.
 *
 * **Idempotent, not single-use.** An already-verified account answers
 * `"verified"` and the stamp is left at its original time — the write is
 * conditioned on the column being NULL, so a second click (or an inbox scanner
 * pre-fetching the link) neither fails nor rewrites the date. That is what
 * makes doing this write during a GET acceptable: there is no state a repeat
 * can damage, and nothing here depends on the caller.
 */
export async function redeemEmailVerificationToken(
  token: string | null | undefined,
): Promise<"verified" | "invalid"> {
  if (!token) return "invalid";

  const claimedUserId = parseEmailVerificationTokenUserId(token);
  if (!claimedUserId) return "invalid";

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", claimedUserId)
    .single();

  if (!profile?.email) return "invalid";

  const userId = await verifyEmailVerificationToken(token, profile.email);
  if (!userId) return "invalid";

  // `is("email_verified_at", null)` is what keeps the stamp at the moment the
  // address was first confirmed. A row already carrying one matches nothing,
  // which is a successful no-op rather than an error.
  const { error } = await admin
    .from("profiles")
    .update({ email_verified_at: new Date().toISOString() })
    .eq("id", userId)
    .is("email_verified_at", null);

  // A failed write is the one case the reader must not be told "verified" — the
  // link is good, the state did not change, and a second click should be able
  // to fix it.
  if (error) {
    console.error("Email verification write failed:", error.message);
    return "invalid";
  }

  return "verified";
}
