import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import {
  identitiesHoldEmail,
  isEmailAlreadyRegistered,
} from "@/lib/auth-email.server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  adminUserEmailBody,
  adminUserEmailWriteResult,
  USER_EMAIL_TAKEN,
} from "@/services/users/users.contracts";

/**
 * PATCH /api/admin/users/[id]/email — an admin correcting the address another
 * account signs in with. The case it exists for is the signup typo: a parent
 * who registered as `aino@gmial.com` and can neither verify nor reset a
 * password until somebody moves the account to the address they meant.
 *
 * **Two writes that must not drift apart, in a fixed order.** The address lives
 * on `auth.users` (what sign-in reads) and on `public.profiles` (what every page
 * reads), and nothing syncs the second from the first after signup:
 *
 * 1. **Auth, through the Admin API, first.** Never raw SQL: `auth.identities.email`
 *    is a generated column over `identity_data`, so an `UPDATE auth.users` leaves
 *    sign-in answering to the old address while the change looks as though it
 *    worked. Auth is also the only write that enforces uniqueness, so it is the
 *    only one that can legitimately refuse — and when it does, `profiles` has
 *    not been touched and there is nothing to unwind.
 * 2. **The identity is verified on a fresh read** before anything else moves,
 *    because the update's own response carries the identities as they were
 *    before the write. An address that reached `auth.users` but not the identity
 *    fails loudly here rather than being reported as done.
 * 3. **Then `profiles.email`, on the service-role client**, because
 *    `authenticated` holds no UPDATE grant on that column — not even an admin
 *    session can write it. Its trigger nulls `email_verified_at`, so the new
 *    address starts unverified exactly as a fresh signup's would — and since a
 *    verification link is signed over the address `profiles.email` held when
 *    it was minted, every link still in an inbox stops working too. That
 *    column is the app's only verified-email state; GoTrue's own confirmation
 *    stamp (`email_confirm` below) is not read anywhere, because Supabase Auth
 *    confirmations are off.
 *
 * **Repeating it finishes the job.** Each half is skipped when it already holds
 * the target, so a retry after a failure between the two brings `profiles` into
 * line with an auth record that already moved, rather than tripping over it.
 *
 * **A target already holding the address is refused, not resolved.** It is the
 * duplicate-account case: the other account has data of its own, and freeing
 * the address means deciding what becomes of it — a judgement no button makes.
 * GoTrue's own uniqueness refusal is the detector. It is the authority the
 * address is unique *in*, it costs no extra read, and it cannot race; a lookup
 * on `profiles.email` would be a second opinion from the one half that is
 * allowed to lag.
 *
 * **Every role may be edited, a gamer included** — the owner's ruling. What the
 * route does not do is touch a child's `gamer_profiles.sign_in`: it moves the
 * address and nothing else. For an `email`-mode child that is the whole story.
 * For the two synthetic modes the address is the sign-in handle — a
 * username-mode child's username *is* its local part — so moving it to a real
 * mailbox changes what the child types to sign in while the mode still names
 * the old shape. The body schema refuses our synthetic domain, so this route
 * cannot rename a username; that stays with the parent's own settings.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can change another user's email address",
  params: z.object({ id: z.string().uuid() }),
  body: adminUserEmailBody,
  response: adminUserEmailWriteResult,

  handler: async ({ supabase, params, body }) => {
    const userId = params.id;
    const { email } = body;

    // Read the target on the user-bound client: an admin may read every
    // profile, so a miss here really is "no such user".
    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .maybeSingle();

    if (targetError) throw targetError;

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const admin = createAdminClient();

    const { data: current, error: readError } =
      await admin.auth.admin.getUserById(userId);
    if (readError) {
      throw new ApiError(
        `user ${userId}: auth read failed before the address change, nothing written: ${readError.message}`,
        500,
      );
    }

    // `current` is already a fresh read, so when auth holds the target (a retry
    // after a partial failure) its identities are checked as they stand.
    let authUser = current.user;

    if (authUser.email?.toLowerCase() !== email) {
      const { error: authError } = await admin.auth.admin.updateUserById(
        userId,
        { email, email_confirm: true },
      );

      if (authError) {
        if (isEmailAlreadyRegistered(authError)) {
          throw new ApiError(
            `user ${userId}: ${email} already belongs to another account`,
            409,
            USER_EMAIL_TAKEN,
          );
        }
        throw new ApiError(
          `user ${userId}: auth write failed, profiles untouched: ${authError.message}`,
          500,
        );
      }

      const { data: reread, error: rereadError } =
        await admin.auth.admin.getUserById(userId);
      if (rereadError) {
        throw new ApiError(
          `user ${userId}: auth write landed but could not be verified; repeating the change finishes it`,
          500,
        );
      }
      authUser = reread.user;
    }

    if (!identitiesHoldEmail(authUser, email)) {
      throw new ApiError(
        `user ${userId}: auth.users holds ${email} but auth.identities does not — sign-in still answers to the old address`,
        500,
      );
    }

    if (target.email !== email) {
      const { error: profileError } = await admin
        .from("profiles")
        .update({ email })
        .eq("id", userId);
      if (profileError) {
        throw new ApiError(
          `user ${userId}: auth moved to ${email} but profiles.email did not (${profileError.message}); repeating the change finishes it`,
          500,
        );
      }
    }

    return { success: true as const, email };
  },
});
