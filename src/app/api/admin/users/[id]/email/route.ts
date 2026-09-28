import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import {
  identitiesHoldEmail,
  isEmailAlreadyRegistered,
} from "@/lib/auth-email.server";
import { hasRealEmail, usernameToSyntheticEmail } from "@/lib/gamer-sign-in";
import { sendGamerWelcomeEmail } from "@/lib/gamer-welcome.server";
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
 * **The writes run in a fixed order.** The address lives on `auth.users` (what
 * sign-in reads) and on `public.profiles` (what every page reads), nothing
 * syncs the second from the first after signup, and the account's credentials
 * have to follow the address before the change is recorded as done:
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
 * 3. **An email-mode child's password is removed** — set to NULL, never to a
 *    random value. A new mailbox is an unproven one, and a password set against
 *    the old address must not carry over to it: the same rule the parent's own
 *    move into `email` mode follows, and the welcome mail (step 6) is how the
 *    child sets a new one. An adult keeps theirs — they chose it at signup —
 *    and a username rename keeps the child's, because only the name moved.
 * 4. **Every session the account holds is ended**, on every device and for
 *    every role, so nothing stays signed in under the address that was
 *    corrected away. GoTrue's own sign-out takes the account's own token, which
 *    an admin does not have, so it is a database function's.
 * 5. **Then `profiles.email`, on the service-role client**, because
 *    `authenticated` holds no UPDATE grant on that column — not even an admin
 *    session can write it. Its trigger nulls `email_verified_at`, so the new
 *    address starts unverified exactly as a fresh signup's would — and since a
 *    verification link is signed over the address `profiles.email` held when
 *    it was minted, every link still in an inbox stops working too. That
 *    column is the app's only verified-email state; GoTrue's own confirmation
 *    stamp (`email_confirm` below) is not read anywhere, because Supabase Auth
 *    confirmations are off.
 * 6. **Last, the welcome mail for an email-mode child**, once `profiles.email`
 *    holds the address its link is signed over. A failed send is logged, not
 *    answered: the move has committed, and the child's parent can resend it
 *    from the child's card. It spends no allowance: admins are trusted, and the
 *    allowance is keyed on the parent's own entitlement.
 *
 * **`profiles.email` is the record that the change is done, and repeating it
 * finishes the job.** The auth write is skipped when auth already holds the
 * target; the password removal and the sign-out run whenever `profiles` has not
 * caught up yet, and both are idempotent. So a retry after a failure anywhere
 * before step 5 redoes exactly what may not have landed, and a request whose
 * address both halves already hold does nothing at all — no sign-out, no mail.
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
 *   The mode stays `username` and the password is kept: only the name the
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
 * None of this carries a compensation of the kind the parent's own mode change
 * does, because nothing here creates a credential the record does not know:
 * the mode never moves, no password is ever set, and the only credential write
 * takes one away. What a failure part-way leaves is a lagging `profiles.email`
 * — with, for an email-mode child, a password that may still open the account
 * at the new address until the retry removes it — and the 500 says to repeat.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can change another user's sign-in address",
  params: z.object({ id: z.string().uuid() }),
  body: adminUserSignInAddressBody,
  response: adminUserEmailWriteResult,

  handler: async ({ request, supabase, params, body }) => {
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
    const { email, takenCode, clearPassword } = resolved;

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
    let authMoved = false;

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
      authMoved = true;
    }

    if (!identitiesHoldEmail(authUser, email)) {
      throw new ApiError(
        `user ${userId}: auth.users holds ${email} but auth.identities does not — sign-in still answers to the old address`,
        500,
      );
    }

    // Both halves already held the address before this request: the change
    // was finished by an earlier one, so there is nothing to sign out and
    // nothing to mail.
    if (!authMoved && target.email === email) {
      return { success: true as const, email };
    }

    if (clearPassword) {
      const { error: passwordError } = await admin.rpc("forfeit_password", {
        p_user_id: userId,
      });
      if (passwordError) {
        throw new ApiError(
          `user ${userId}: auth moved to ${email} but the old password could not be removed (${passwordError.message}); repeating the change finishes it`,
          500,
        );
      }
    }

    const { error: signOutError } = await admin.rpc("end_every_session", {
      p_user_id: userId,
    });
    if (signOutError) {
      throw new ApiError(
        `user ${userId}: auth moved to ${email} but its sessions could not be ended (${signOutError.message}); repeating the change finishes it`,
        500,
      );
    }

    // Written unconditionally: when it already holds the address the write
    // changes nothing, and its trigger only fires on a changed address.
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

    if (clearPassword) {
      try {
        await sendGamerWelcomeEmail({ request, gamerId: userId });
      } catch (mailError) {
        console.error(
          `user ${userId}: the address moved but the welcome mail failed — the parent can resend it from the child's card`,
          mailError,
        );
      }
    }

    return { success: true as const, email };
  },
});

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * The address the request asks the account to move to, if the account admits
 * that form at all — or the refusal saying why not — and whether the move takes
 * the password with it. See the route's doc comment for the rules.
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
}): Promise<
  NextResponse | { email: string; takenCode: string; clearPassword: boolean }
> {
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
    return {
      email: body.email,
      takenCode: USER_EMAIL_TAKEN,
      // Only a child: an adult chose their password and keeps it.
      clearPassword: signIn === "email",
    };
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
    clearPassword: false,
  };
}
