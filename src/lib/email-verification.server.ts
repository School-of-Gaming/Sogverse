import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseEmailVerificationTokenUserId,
  verifyEmailVerificationToken,
} from "@/lib/email-verification";
import type { GamerSignIn, UserRole } from "@/types";

/**
 * What redeeming a verification link tells the page that redeemed it.
 *
 * `outcome` is the whole of the answer for an adult: the address is confirmed or
 * the link is dead. The rest exists for a child in sign-in mode `email`, whose
 * verification is the *first* step of getting an account they can actually use —
 * the second is a password, which they set through the ordinary reset flow, and
 * the page offers them the button that starts it. Everything needed to decide
 * that is here, so the page makes no second lookup of its own.
 *
 * Every field but `outcome` is null on an invalid link — there is no account to
 * describe.
 *
 * **There is deliberately no "was this the first redemption" signal.** One
 * existed, and its only reader was a page that mailed a recovery token on the
 * strength of it — a credential sent by whatever opened the URL, a mail scanner
 * included. Nothing here now has a side effect to key on, so a first click and a
 * fiftieth are the same answer, which is what the redemption honestly is.
 */
export interface EmailVerificationRedemption {
  outcome: "verified" | "invalid";
  role: UserRole | null;
  /** The gamer's sign-in mode; null for every other role, which has none. */
  signIn: GamerSignIn | null;
  /** The address that was verified. */
  email: string | null;
}

const INVALID: EmailVerificationRedemption = {
  outcome: "invalid",
  role: null,
  signIn: null,
  email: null,
};

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
): Promise<EmailVerificationRedemption> {
  if (!token) return INVALID;

  const claimedUserId = parseEmailVerificationTokenUserId(token);
  if (!claimedUserId) return INVALID;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, role")
    .eq("id", claimedUserId)
    .single();

  if (!profile?.email) return INVALID;

  const userId = await verifyEmailVerificationToken(token, profile.email);
  if (!userId) return INVALID;

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
    return INVALID;
  }

  // Read after the stamp, not before: the mode is what tells the page whether a
  // password is still owed, and only a gamer has one.
  let signIn: GamerSignIn | null = null;
  if (profile.role === "gamer") {
    const { data: gamerProfile } = await admin
      .from("gamer_profiles")
      .select("sign_in")
      .eq("user_id", userId)
      .maybeSingle();
    signIn = gamerProfile?.sign_in ?? null;
  }

  return {
    outcome: "verified",
    role: profile.role,
    signIn,
    email: profile.email,
  };
}
