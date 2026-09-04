import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  randomSyntheticGamerEmail,
  usernameToSyntheticEmail,
} from "@/lib/gamer-sign-in";
import { sendGamerWelcomeEmail } from "@/lib/gamer-welcome.server";
import { lookupMinecraftUser } from "@/lib/mojang";
import { lookupRobloxProfile } from "@/lib/roblox";
import {
  updateGamerBody,
  GAMER_EMAIL_TAKEN,
  GAMER_USERNAME_TAKEN,
} from "@/services/gamers/gamers.contracts";
import type { GamerSignIn } from "@/types";

/**
 * PATCH /api/gamers/[id] — a parent edits one of their own gamers.
 *
 * Two authorization layers before anything is written: the parent_gamer link is
 * confirmed on the RLS-bound client (so the database agrees the caller owns the
 * link), and the target's role is confirmed to be `gamer` on the admin client
 * (so a link row can never be used to reach a non-gamer account).
 *
 * CHANGING HOW A CHILD SIGNS IN is the one edit here that is not a field update,
 * because the account's *address* is what a sign-in mode is. Each destination
 * writes the same three places — `auth.users`, `profiles.email`, and
 * `gamer_profiles.sign_in` — and differs only in what it puts there:
 *
 *  - **→ `parent`** — a fresh random synthetic handle, and the password
 *    scrambled to a value nobody holds. GoTrue cannot *unset* a password, so
 *    overwriting it with 32 random bytes is the closest thing to removing one:
 *    the account becomes switch-only again in the only sense that matters, which
 *    is that no credential anyone knows will open it.
 *  - **→ `username`** (or a username change) — the address becomes the synthetic
 *    handle built from the new username. A password is required when *entering*
 *    the mode and optional afterwards, which is what makes a parent resetting a
 *    forgotten password a one-field edit.
 *  - **→ `email`** — the address becomes the child's real mailbox, the
 *    password is scrambled, and the welcome mail goes out again. Both halves
 *    are the point: a new address is unproven until it is clicked, and a
 *    password set against the *old* address must not survive the move.
 *
 * AN ACCOUNT ALREADY IN `email` MODE DOES NOT TAKE A NEW ADDRESS. Changing an
 * account's email address is not something this platform supports for any role
 * (owner ruling), and when it does it will be one mechanism built once, for
 * every role, rather than a form on one card. So an `email` key is only ever
 * the address a child is *entering* the mode with, and one that arrives with no
 * transition to make is refused — here, because this is the only layer that can
 * see the mode the account is already in. A username is not an address in the
 * same sense — it is a sign-in handle — so replacing one stays supported above.
 *
 * A password may be set ONLY while the account is in `username` mode. In the
 * other two it would be a credential with nothing to type it against — `parent`
 * has no login at all, and `email` deliberately hands password-setting to the
 * child after they have proved the address is theirs.
 *
 * THE INVARIANT ACROSS ALL THREE: a credential that opens a gamer account
 * exists only where `gamer_profiles.sign_in` says one does. They cannot be one
 * transaction — two are GoTrue's and one is ours — so ordering plus a
 * compensation carries it instead: the mode is written LAST, because it is the
 * record of the other two rather than a part of them.
 *
 * THE COMPENSATED WINDOW IS EVERYTHING AFTER THE AUTH WRITE LANDS, not the mode
 * write alone. The moment GoTrue accepts the new address and password, a
 * credential exists that nothing in our own tables records — and three separate
 * steps can still throw before the record catches up: the identity re-read, the
 * `profiles.email` copy, and the mode write itself. Any of them leaving that
 * credential live is the shape the invariant forbids, so the whole window is
 * wrapped and every throw in it scrambles the password before it is rethrown.
 * The rethrow is the original failure, so each of the specific 500s below still
 * says which write broke. See `compensateUnrecordedCredential`.
 *
 * THE TWO AUTH-SIDE WRITES ARE ORDERED, AND THE ORDER IS THE SAME ONE THE HAND OPERATION
 * USES (`scripts/correct-user-email.ts`). Auth goes first, because it is the
 * only write that enforces uniqueness and therefore the only one that can
 * legitimately fail — a refusal there leaves `profiles` untouched and nothing to
 * unwind. And `auth.identities.email` is a generated column that the Admin API
 * moves along with `auth.users` while a raw update would not, so the identity is
 * re-read and checked rather than assumed: an account whose users row moved and
 * whose identity did not still answers sign-in on the *old* address, which looks
 * exactly like success. `profiles.email` follows, and its own trigger clears
 * `email_verified_at`, which is what makes every outstanding verification link
 * for this child die with the address it was minted for.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "customer",
  forbiddenMessage: "Only customers can update gamer accounts",
  params: z.object({ id: z.string().uuid() }),
  body: updateGamerBody,

  // The hand-rolled `typeof` checks are now the shared body schema, which also
  // preserves the one distinction the old code carried in `"key" in body`: an
  // explicit null Minecraft username unlinks, an absent key leaves it alone.
  //
  // Every write failure used to be returned as a 500 carrying the driver's or
  // GoTrue's own message. Those are logged now and answered through the shared
  // table.

  handler: async ({ request, supabase, user, params, body }) => {
    const gamerId = params.id;

    // Verify parent-child relationship via the RLS-protected client.
    const { data: link, error: linkError } = await supabase
      .from("parent_gamer")
      .select("id")
      .eq("parent_id", user.id)
      .eq("gamer_id", gamerId)
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json(
        { error: "Not authorized to manage this gamer" },
        { status: 403 },
      );
    }

    // Verify the target really is a gamer (defense in depth).
    const admin = createAdminClient();
    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", gamerId)
      .single();

    if (targetError || targetProfile.role !== "gamer") {
      return NextResponse.json(
        { error: "Not authorized to manage this account" },
        { status: 403 },
      );
    }

    const credentialChange = await applyCredentialChange({
      admin,
      gamerId,
      body,
    });
    if (credentialChange instanceof NextResponse) return credentialChange;

    if (body.firstName !== undefined) {
      const { data: updatedRow, error: profileError } = await admin
        .from("profiles")
        .update({ first_name: body.firstName })
        .eq("id", gamerId)
        .select("first_name, last_name")
        .single();

      if (profileError) throw profileError;

      // Sync to auth metadata so the Supabase dashboard label stays current.
      // Compose display_name from the post-update row so the dashboard sees a
      // human-readable full name. The profiles table is the source of truth.
      const composed = [updatedRow.first_name, updatedRow.last_name]
        .filter(Boolean)
        .join(" ");
      const { error: authError } = await admin.auth.admin.updateUserById(
        gamerId,
        {
          user_metadata: {
            first_name: updatedRow.first_name,
            display_name: composed,
          },
        },
      );

      if (authError) throw authError;
    }

    if (body.minecraftUsername !== undefined) {
      const username = body.minecraftUsername;
      const mcUpsert =
        username === null
          ? { user_id: gamerId, minecraft_username: null, minecraft_uuid: null }
          : {
              user_id: gamerId,
              minecraft_username: username,
              minecraft_uuid:
                (await lookupMinecraftUser(username))?.uuid ?? null,
            };

      const { error: mcError } = await admin
        .from("minecraft_accounts")
        .upsert(mcUpsert, { onConflict: "user_id" });

      if (mcError) throw mcError;
    }

    // The same shape one platform over. The two are independent: a parent may
    // send either key, both, or neither, and an absent key leaves that
    // platform's link untouched.
    if (body.robloxUsername !== undefined) {
      const username = body.robloxUsername;
      const robloxUpsert =
        username === null
          ? { user_id: gamerId, roblox_username: null, roblox_user_id: null }
          : {
              user_id: gamerId,
              roblox_username: username,
              roblox_user_id:
                (await lookupRobloxProfile(username))?.userId ?? null,
            };

      const { error: robloxError } = await admin
        .from("roblox_accounts")
        .upsert(robloxUpsert, { onConflict: "user_id" });

      if (robloxError) throw robloxError;
    }

    // Last, and only once every write has committed: a child now holding a real
    // address needs the link that proves it is theirs. Swallowed like every other
    // product send — the mode change is the outcome the parent asked for and it
    // has already happened, and the parent can send the link again from the
    // child's card.
    //
    // IT IS CHARGED TO THE SAME PER-CHILD ALLOWANCE THE RESEND BUTTON SPENDS.
    // The mail is identical and so is the way to make it repeat: the resend
    // route pays `request_gamer_verification_email` (six an hour, keyed on the
    // child), and a parent flipping a child in and out of `email` mode would
    // otherwise be an uncounted second tap on the same button. The RPC runs on
    // the CALLER'S client, whose `is_parent_of` guard re-derives entitlement
    // from `auth.uid()` rather than trusting the id in the path.
    //
    // A refusal does NOT undo the mode change — that write has committed and it
    // is what the parent asked for. It costs the automatic mail, and the parent
    // can send it from the child's card once the hour has turned (rate-limited
    // there too), so the honest answer is a success with a log rather than an
    // error naming a mail the parent never asked to send.
    if (credentialChange.welcomeGamer) {
      try {
        const { data: accepted, error: rateLimitError } = await supabase.rpc(
          "request_gamer_verification_email",
          { p_gamer_id: gamerId },
        );
        if (rateLimitError) throw rateLimitError;
        if (accepted) {
          await sendGamerWelcomeEmail({ request, gamerId });
        } else {
          console.warn(
            `gamer ${gamerId}: the verification-mail allowance is spent, so the mode change carried no welcome mail — the parent can resend from the child's card`,
          );
        }
      } catch (mailError) {
        console.error("gamer update: welcome email failed", mailError);
      }
    }

    const { data: updatedProfile, error: fetchError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", gamerId)
      .single();

    if (fetchError) throw fetchError;

    return { gamer: updatedProfile };
  },
});

type AdminClient = ReturnType<typeof createAdminClient>;
type UpdateBody = z.infer<typeof updateGamerBody>;

/**
 * A password nobody holds.
 *
 * GoTrue has no way to remove a password once set, so leaving a mode that had
 * one means overwriting it with a value that was never shown to anyone and is
 * not stored anywhere. 32 bytes from the CSPRNG, discarded the moment the write
 * returns. The account is then reachable only the way its new mode says it is.
 */
function scrambledPassword(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Everything about the child's credentials, decided together and written
 * together, because the mode and the address are one fact.
 *
 * Returns a `NextResponse` for a refusal the parent can act on, or a note of
 * what the caller still owes the child (today: the welcome mail).
 */
async function applyCredentialChange(args: {
  admin: AdminClient;
  gamerId: string;
  body: UpdateBody;
}): Promise<NextResponse | { welcomeGamer: boolean }> {
  const { admin, gamerId, body } = args;
  const nothingToDo = { welcomeGamer: false };

  if (
    body.signIn === undefined &&
    body.username === undefined &&
    body.email === undefined &&
    body.password === undefined
  ) {
    return nothingToDo;
  }

  const { data: gamerProfile, error: modeError } = await admin
    .from("gamer_profiles")
    .select("sign_in")
    .eq("user_id", gamerId)
    .single();
  if (modeError) throw modeError;

  const currentMode: GamerSignIn = gamerProfile.sign_in;
  const nextMode: GamerSignIn = body.signIn ?? currentMode;
  const entering = nextMode !== currentMode;

  // A password belongs to exactly one mode. Checked against the mode the account
  // will be in, not the one it is in, so "switch to username and set a password"
  // is one request rather than two.
  if (body.password !== undefined && nextMode !== "username") {
    return NextResponse.json(
      {
        error:
          "A password can only be set on a gamer who signs in with a username.",
      },
      { status: 400 },
    );
  }

  // The same test for the other two credential fields, and for the same reason:
  // a field the resolved mode has no use for is a request that cannot be
  // honoured, and answering it 200 while dropping the value is the worst of the
  // three possible answers — the parent is told their edit landed. The schema
  // catches these only when `signIn` is stated; a bare `{ username }` against a
  // child in `parent` mode, or a bare `{ email }` against one in `username`
  // mode, resolves to a mode that will not use it and can only be caught here.
  if (body.username !== undefined && nextMode !== "username") {
    return NextResponse.json(
      {
        error:
          "A username can only be set on a gamer who signs in with a username.",
      },
      { status: 400 },
    );
  }
  if (body.email !== undefined && nextMode !== "email") {
    return NextResponse.json(
      {
        error:
          "An email address can only be set on a gamer who signs in with their own email address.",
      },
      { status: 400 },
    );
  }

  let newEmail: string | null = null;
  let newPassword: string | null = null;
  let welcomeGamer = false;

  if (nextMode === "parent") {
    if (!entering) return nothingToDo;
    // Fresh handle rather than the one they had: the old address was a username
    // the family chose or an address a child reads, and neither should stay
    // attached to an account that is no longer reachable through it.
    newEmail = randomSyntheticGamerEmail();
    newPassword = scrambledPassword();
  } else if (nextMode === "username") {
    if (entering && body.password === undefined) {
      return NextResponse.json(
        { error: "A password is required to give this gamer a username sign-in." },
        { status: 400 },
      );
    }
    if (entering && body.username === undefined) {
      return NextResponse.json(
        { error: "A username is required for this sign-in mode." },
        { status: 400 },
      );
    }
    if (body.username !== undefined) {
      newEmail = usernameToSyntheticEmail(body.username);
    }
    if (body.password !== undefined) newPassword = body.password;
  } else {
    if (entering && body.email === undefined) {
      return NextResponse.json(
        { error: "An email address is required for this sign-in mode." },
        { status: 400 },
      );
    }
    // The address a child already signs in with is not editable. See the
    // route's doc comment: an address change is a platform-wide mechanism we
    // have not built, and this is the only layer that can tell one from a child
    // entering the mode, because it is the only one that knows the current mode.
    if (!entering && body.email !== undefined) {
      return NextResponse.json(
        {
          error:
            "This gamer already signs in with an email address, and changing an account's address is not supported.",
        },
        { status: 400 },
      );
    }
    if (body.email !== undefined) {
      newEmail = body.email;
      // A new address is an unproven address, and the password that was set
      // against the old one must not carry over to it.
      newPassword = scrambledPassword();
      welcomeGamer = true;
    }
  }

  if (newEmail === null && newPassword === null) {
    // Nothing reached GoTrue, so there is no credential a later failure could
    // leave unrecorded and nothing to compensate: the mode write stands on its
    // own. No transition produces this shape today — all three write an address
    // — but the branch says so rather than the code assuming it.
    if (entering) {
      await recordSignInMode({ admin, gamerId, currentMode, nextMode });
    }
    return { welcomeGamer };
  }

  await writeAuthCredentials({
    admin,
    gamerId,
    newEmail,
    newPassword,
    mode: nextMode,
  });

  // FROM HERE THE CREDENTIAL IS LIVE AND OUR OWN TABLES DO NOT RECORD IT. Each
  // remaining step can throw — the identity re-read, the `profiles.email` copy,
  // the mode write — and any of them leaving a working credential behind is the
  // one shape the invariant forbids, so the whole window is compensated rather
  // than its last step alone.
  //
  // The wrap is deliberately uniform, including the case where the mode is not
  // moving at all (a parent renaming a username-mode child). There the address
  // is half of the credential, so an auth write the app's own tables never
  // learned about is the same unrecorded credential under a different name —
  // and the cost of treating it that way is a password the parent can simply
  // set again.
  try {
    if (newEmail !== null) {
      await copyAddressToProfile({ admin, gamerId, newEmail });
    }
    if (entering) {
      await recordSignInMode({ admin, gamerId, currentMode, nextMode });
    }
  } catch (failure) {
    await compensateUnrecordedCredential({
      admin,
      gamerId,
      currentMode,
      nextMode,
      failure,
    });
  }

  return { welcomeGamer };
}

/**
 * Write the mode — the record of the credential writes that came before it.
 *
 * Throws rather than returning the error, because it runs inside the
 * compensated window and a throw is what puts the withdrawal on the path.
 */
async function recordSignInMode(args: {
  admin: AdminClient;
  gamerId: string;
  currentMode: GamerSignIn;
  nextMode: GamerSignIn;
}): Promise<void> {
  const { admin, gamerId, currentMode, nextMode } = args;
  const { error } = await admin
    .from("gamer_profiles")
    .update({ sign_in: nextMode })
    .eq("user_id", gamerId);
  if (!error) return;
  console.error(
    `gamer ${gamerId}: gamer_profiles.sign_in write failed moving ${currentMode} -> ${nextMode}`,
    error,
  );
  throw new ApiError(
    `gamer ${gamerId}: sign-in mode could not be recorded`,
    500,
  );
}

/**
 * Something failed after GoTrue accepted the credential, so what the account
 * now holds is a credential nothing records. Take it away again.
 *
 * **The invariant this defends:** a credential that opens a gamer account
 * exists only where `gamer_profiles.sign_in` says one does. The three writes
 * behind a mode change cannot be one transaction — two of them are GoTrue's and
 * one is ours — so the ordering does the work instead, and this is what happens
 * when the ordering runs out. Auth is written first because it is the only one
 * that can legitimately refuse (uniqueness), `profiles.email` follows it, and
 * the mode is written last because it is the *record* of the other two rather
 * than a part of them.
 *
 * **Every failure after the auth write is this failure**, not only the mode
 * write's. Once GoTrue has accepted, the account is already answering to a
 * username and a password the parent has just chosen while our own tables still
 * describe the child they used to be — and that is equally true whether the
 * identity re-read refused, the `profiles.email` copy failed, or the mode write
 * did. A working credential nobody has recorded is precisely what the switch
 * gate is built to rule out: a child holding one could sign in on any machine,
 * and the platform would classify that session by a mode that is a lie.
 *
 * So the password is scrambled back to a value nobody holds, which restores the
 * one property that matters: whatever `sign_in` says, no credential anyone
 * knows will open this account. The address is deliberately left where it
 * landed — moving it back is another write that can fail the same way, and an
 * unreachable account under an unexpected address is a repair, not a breach.
 *
 * The original failure is what gets rethrown, so the parent still meets the
 * specific 500 the broken write raised and the log still names which one it
 * was.
 *
 * Every failure past this point is logged loudly on purpose: it names a row
 * that needs a human, and there is no automatic path back to a consistent
 * state.
 */
async function compensateUnrecordedCredential(args: {
  admin: AdminClient;
  gamerId: string;
  currentMode: GamerSignIn;
  nextMode: GamerSignIn;
  failure: unknown;
}): Promise<never> {
  const { admin, gamerId, currentMode, nextMode, failure } = args;
  console.error(
    `gamer ${gamerId}: a write failed after the credential landed, moving ${currentMode} -> ${nextMode}; scrambling the password so no unrecorded credential survives`,
    failure,
  );

  const { error: scrambleError } = await admin.auth.admin.updateUserById(
    gamerId,
    { password: scrambledPassword() },
  );
  if (scrambleError) {
    console.error(
      `gamer ${gamerId}: THE COMPENSATION ALSO FAILED — this account may hold a working credential that gamer_profiles.sign_in does not record, and needs to be reset by hand`,
      scrambleError,
    );
  }

  throw failure;
}

/**
 * The auth half: the one write that can legitimately refuse, and the only one
 * that runs before there is anything to compensate.
 *
 * Throws a `NextResponse` for the one refusal the parent can act on — the
 * address is already spoken for — so the caller does not have to thread a third
 * return shape through. The wrapper honours a thrown `Response`. Nothing has
 * landed when it does, which is exactly why this half sits OUTSIDE the
 * compensated window: a refusal here leaves the account as it was.
 */
async function writeAuthCredentials(args: {
  admin: AdminClient;
  gamerId: string;
  newEmail: string | null;
  newPassword: string | null;
  mode: GamerSignIn;
}): Promise<void> {
  const { admin, gamerId, newEmail, newPassword, mode } = args;

  const { error: authError } = await admin.auth.admin.updateUserById(gamerId, {
    ...(newEmail !== null ? { email: newEmail, email_confirm: true } : {}),
    ...(newPassword !== null ? { password: newPassword } : {}),
  });

  if (authError) {
    if (isEmailAlreadyRegistered(authError)) {
      throw NextResponse.json(
        mode === "username"
          ? {
              error: "That username is already taken. Pick another.",
              code: GAMER_USERNAME_TAKEN,
            }
          : {
              error: "That email address already has an account.",
              code: GAMER_EMAIL_TAKEN,
            },
        { status: 409 },
      );
    }
    throw authError;
  }
}

/**
 * The profiles half, and the identity check that has to pass before it: run
 * only when the address moved, and only ever from inside the compensated
 * window, because by the time either can fail the credential is already live.
 * See the route's doc comment for why each is here.
 */
async function copyAddressToProfile(args: {
  admin: AdminClient;
  gamerId: string;
  newEmail: string;
}): Promise<void> {
  const { admin, gamerId, newEmail } = args;

  // Re-read rather than trusting the update's own payload: it carries the
  // identities array as it was BEFORE the write, so checking it there reports a
  // failure on every successful run.
  const { data: reread, error: rereadError } =
    await admin.auth.admin.getUserById(gamerId);
  if (rereadError) {
    throw new ApiError(
      `gamer ${gamerId}: auth email write landed but could not be verified`,
      500,
    );
  }
  const identities = (reread.user.identities ?? [])
    .map((identity) => identity.identity_data?.email)
    .filter((email): email is string => typeof email === "string");
  if (!identities.some((email) => email.toLowerCase() === newEmail.toLowerCase())) {
    throw new ApiError(
      `gamer ${gamerId}: auth.users moved but auth.identities did not — sign-in still answers to the old address`,
      500,
    );
  }

  // Nothing syncs this; the signup trigger copies the address on INSERT only.
  // Its own trigger clears `email_verified_at`, which retires every outstanding
  // verification link for this child in the same statement.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ email: newEmail })
    .eq("id", gamerId);
  if (profileError) {
    // The same shape as the identity mismatch above, and for the same reason.
    // Auth has already moved by the time this runs, so a raw rethrow would
    // report "a write failed" when what actually happened is that the account
    // now authenticates as one address while every read in the app names
    // another — the divergence the switch route's GoTrue lookup exists to
    // survive. Said specifically, so the log names which of the two is stale.
    console.error(
      "gamer update: profiles.email write failed after the auth move",
      profileError,
    );
    throw new ApiError(
      `gamer ${gamerId}: auth.users moved to ${newEmail} but profiles.email did not — the account authenticates as an address the app does not know`,
      500,
    );
  }
}

/**
 * Whether GoTrue refused because the address already has an account. The same
 * two-step test the registration routes use: the machine-readable code first,
 * the prose as the fallback for a deployment that drops it.
 */
function isEmailAlreadyRegistered(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "email_exists") return true;
  return (
    "message" in error &&
    typeof error.message === "string" &&
    /already( been)? registered/i.test(error.message)
  );
}
