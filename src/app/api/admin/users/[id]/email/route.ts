import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import {
  identitiesHoldEmail,
  isEmailAlreadyRegistered,
} from "@/lib/auth-email.server";
import { hasRealEmail, usernameToSyntheticEmail } from "@/lib/gamer-sign-in";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  adminUserSignInAddressBody,
  adminUserEmailWriteResult,
  USER_EMAIL_TAKEN,
  USER_USERNAME_TAKEN,
  type AdminUserSignInAddressBody,
} from "@/services/users/users.contracts";
import type { GamerSignIn, UserRole } from "@/types";

/**
 * PATCH /api/admin/users/[id]/email — an admin correcting the address another
 * account signs in with, or a username-mode child's username. The case it exists for is the signup typo: a parent
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
 * **The correction moves the address and nothing else, by design.** The
 * password stays as it was, every session stays signed in, whatever the role,
 * and nothing is mailed. Securing the account is the user's own job, through a
 * password reset to the address that is now theirs. An `email`-mode child whose
 * welcome mail went to the mistyped address gets it again from the parent's
 * resend on the child's card, or uses forgot-password.
 *
 * **A target already holding the address is refused, not resolved.** It is the
 * duplicate-account case: the other account has data of its own, and freeing
 * the address means deciding what becomes of it — a judgement no button makes.
 * GoTrue's own uniqueness refusal is the detector. It is the authority the
 * address is unique *in*, it costs no extra read, and it cannot race; a lookup
 * on `profiles.email` would be a second opinion from the one half that is
 * allowed to lag.
 *
 * **What an account admits depends on how it signs in** — the owner's ruling,
 * and read here from `gamer_profiles.sign_in` on the service-role client
 * because that row, not the caller, is the authority on it:
 *
 * - **An adult, or a child in `email` mode, takes a real mailbox** (`{ email }`).
 * - **A child in `username` mode takes a new username** (`{ username }`), which
 *   the route turns into the synthetic handle that *is* the child's address.
 *   The mode stays `username` and the password is untouched: only what the
 *   child types changes. GoTrue's uniqueness on the address is what makes a
 *   username unique, so a taken one is the same refusal as a taken address,
 *   under its own code.
 * - **A child in `parent` mode takes neither.** Its address is a random handle
 *   nobody types, and there is nothing to rename.
 *
 * Every other pairing is refused before anything is written. Moving a
 * synthetic-mode child onto a real mailbox is not an address correction but a
 * privilege change: password reset refuses only the synthetic *string*, so a
 * `parent`-mode child given a mailbox could gain a password and sign in
 * without the parent, and a `username`-mode child would be locked out of the
 * name they type. Changing a child's sign-in mode is the parent's, through
 * their own settings, where the mode and the credentials move together.
 *
 * A username change carries no compensation of the kind the parent's own
 * rename does, because nothing about it outruns the record: the mode was
 * `username` before the write and still is, and the password the child holds
 * is the one it always was. What a failure between the halves leaves is the
 * same lagging `profiles.email` an address change can leave, and a retry
 * finishes it the same way.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can change another user's sign-in address",
  params: z.object({ id: z.string().uuid() }),
  body: adminUserSignInAddressBody,
  response: adminUserEmailWriteResult,

  handler: async ({ supabase, params, body }) => {
    const userId = params.id;

    // Read the target on the user-bound client: an admin may read every
    // profile, so a miss here really is "no such user".
    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("email, role")
      .eq("id", userId)
      .maybeSingle();

    if (targetError) throw targetError;

    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const admin = createAdminClient();

    const resolved = await resolveTargetAddress({
      admin,
      userId,
      role: target.role,
      body,
    });
    if (resolved instanceof NextResponse) return resolved;
    const { email, takenCode } = resolved;

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
            takenCode,
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

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * The address the request asks the account to move to, if the account admits
 * that form at all — or the refusal saying why not. See the route's doc comment
 * for the rules.
 *
 * The mode is read on the service-role client, never taken from the request: it
 * is what decides whether a mailbox is a correction or a privilege change. A
 * gamer with no `gamer_profiles` row has no mode to admit anything under, so it
 * meets the same refusals as a synthetic one.
 */
async function resolveTargetAddress(args: {
  admin: AdminClient;
  userId: string;
  role: UserRole;
  body: AdminUserSignInAddressBody;
}): Promise<NextResponse | { email: string; takenCode: string }> {
  const { admin, userId, role, body } = args;

  let signIn: GamerSignIn | null = null;
  if (role === "gamer") {
    const { data: gamerProfile, error: modeError } = await admin
      .from("gamer_profiles")
      .select("sign_in")
      .eq("user_id", userId)
      .maybeSingle();
    if (modeError) throw modeError;
    signIn = gamerProfile?.sign_in ?? null;
  }

  if ("email" in body) {
    if (!hasRealEmail({ role, sign_in: signIn })) {
      return NextResponse.json(
        {
          error:
            "This gamer does not sign in with an email address, so their address cannot be changed. Their parent changes how they sign in.",
        },
        { status: 400 },
      );
    }
    return { email: body.email, takenCode: USER_EMAIL_TAKEN };
  }

  if (signIn !== "username") {
    return NextResponse.json(
      {
        error:
          "Only a gamer who signs in with a username has a username to change.",
      },
      { status: 400 },
    );
  }
  return {
    email: usernameToSyntheticEmail(body.username),
    takenCode: USER_USERNAME_TAKEN,
  };
}
