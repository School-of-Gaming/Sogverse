import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  randomSyntheticGamerEmail,
  usernameToSyntheticEmail,
} from "@/lib/gamer-sign-in";
import { lookupMinecraftUser } from "@/lib/mojang";
import { lookupRobloxProfile } from "@/lib/roblox";
import {
  createGamerBody,
  CREATE_GAMER_PIN_REQUIRED_SQLSTATE,
  GAMER_EMAIL_TAKEN,
  GAMER_PIN_REQUIRED,
  GAMER_USERNAME_TAKEN,
} from "@/services/gamers/gamers.contracts";
import { sendGamerWelcomeEmail } from "@/lib/gamer-welcome.server";
import type { GenderType } from "@/types";

/**
 * POST /api/gamers/create — a parent adds a child account.
 *
 * The auth user is created before the promotion RPC runs, so any failure after
 * that point would orphan it (a login with no usable gamer record). The RPC is
 * transactional, so the database is always left untouched on failure; the
 * compensating delete below covers the auth-user side that lives outside that
 * transaction, including the case where the wrapper's catch is what ends the
 * request.
 *
 * THE SIGN-IN MODE DECIDES WHAT AUTH USER IS CREATED, and the three shapes are
 * genuinely different accounts rather than one account with a flag:
 *
 *  - `parent` — a random synthetic handle, no password. Switch-only, and what
 *    every gamer was before the modes existed.
 *  - `username` — the parent's chosen handle as a synthetic address, plus a
 *    password. GoTrue's uniqueness on the address is what makes the username
 *    unique, so a duplicate comes back as a create failure rather than as a
 *    check we would have had to race.
 *  - `email` — the child's real address, and deliberately NO password: they
 *    verify the address first and then set one through the ordinary reset flow.
 *
 * `email_confirm` is set in all three, and means nothing about verification as
 * families experience it: Supabase's own confirmation flow is off everywhere in
 * this codebase, and what a parent and child see is `profiles.email_verified_at`,
 * which stays null until the child clicks the link in the mail sent below.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "customer",
  forbiddenMessage: "Switch to a parent account to add a gamer.",
  body: createGamerBody,

  // The body's hand-rolled `typeof` checks are now the shared schema. Every RPC
  // failure is logged and answered generically, which is what this route already
  // did deliberately ("it's Postgres text the parent shouldn't see") — with one
  // exception the parent can act on: the missing-PIN refusal, which is mapped to
  // its own code below.

  handler: async ({ request, user, body }) => {
    const admin = createAdminClient();
    const {
      firstName,
      dateOfBirth,
      gender: providedGender,
      minecraftUsername,
      robloxUsername,
      signIn,
      username,
      email,
      password,
    } = body;

    const dobDate = new Date(dateOfBirth + "T00:00:00");
    if (isNaN(dobDate.getTime()) || dobDate > new Date()) {
      return NextResponse.json(
        { error: "Date of birth cannot be in the future" },
        { status: 400 },
      );
    }

    // "" and null both mean "no value recorded".
    const gender: GenderType | null =
      providedGender === undefined ||
      providedGender === null ||
      providedGender === ""
        ? null
        : providedGender;

    // The address the auth user is created with. In `username` and `email` mode
    // the parent chose it, so a collision is theirs to resolve and GoTrue's
    // uniqueness error is the answer. Only the generated handle is checked
    // here — belt-and-braces, since 64 bits of entropy makes a collision
    // vanishingly improbable, but it costs one indexed read to retry once.
    let authEmail: string;
    if (signIn === "username" && username !== undefined) {
      authEmail = usernameToSyntheticEmail(username);
    } else if (signIn === "email" && email !== undefined) {
      authEmail = email;
    } else if (signIn === "parent") {
      authEmail = randomSyntheticGamerEmail();
      const { data: collision } = await admin
        .from("profiles")
        .select("id")
        .eq("email", authEmail)
        .maybeSingle();
      if (collision) authEmail = randomSyntheticGamerEmail();
    } else {
      // Unreachable: the body schema refuses a mode without the field it needs.
      // Answered rather than asserted away, because a schema and a switch that
      // disagree should fail loudly on our side rather than mint an account with
      // an address nobody chose.
      throw new ApiError(
        `sign-in mode ${signIn} arrived without its credential fields`,
        500,
      );
    }

    // Snapshot the parent's last_name onto the gamer at creation time. The
    // parent's UI never asks for the gamer's last_name; we copy it once here
    // and never sync. TODO(name-sync): if a parent later changes their
    // last_name, gamer profiles do not auto-update. Track as a follow-up.
    const { data: parentProfile } = await admin
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .single();
    const inheritedLastName = parentProfile?.last_name ?? "";

    // Resolve the optional game accounts before creating the auth user, so a
    // Mojang or Roblox outage costs nothing rather than an auth user created and
    // then compensated away. Nothing here can reject a username: another
    // Sogverse account may already hold it (siblings share accounts), and one
    // the platform can't resolve is stored as-typed with a null account key.
    //
    // The two lookups are independent reads of two unrelated third parties, so
    // they run together — a child with both handles waits for the slower one
    // rather than for the sum.
    const [resolvedMinecraft, resolvedRoblox] = await Promise.all([
      minecraftUsername
        ? lookupMinecraftUser(minecraftUsername).then((mojang) => ({
            username: minecraftUsername,
            uuid: mojang?.uuid ?? null,
          }))
        : null,
      robloxUsername
        ? lookupRobloxProfile(robloxUsername).then((profile) => ({
            username: robloxUsername,
            userId: profile?.userId ?? null,
          }))
        : null,
    ]);

    // Compose display_name for the Supabase auth dashboard label.
    const composedDisplayName = [firstName, inheritedLastName]
      .filter(Boolean)
      .join(" ");

    // Step 1: Create auth user — trigger assigns customer role by default.
    //
    // A password is passed ONLY in `username` mode, and its absence in the other
    // two is deliberate rather than incidental. A switch-only gamer never
    // authenticates with a typed credential: the parent switches into the child
    // account, and that route mints a magic-link OTP for this user server-side
    // and verifies it immediately, which GoTrue issues for a passwordless user
    // exactly as it does for one with a password — create, generateLink and
    // verifyOtp were all run against staging GoTrue in 2026-08 and the last of
    // them returned a real session. That is a fact about GoTrue's behaviour
    // rather than a guarantee it owes us, so it is worth re-checking if account
    // switching ever breaks. An `email`-mode child has no password yet either,
    // by design: setting a random one would be a credential nobody could use,
    // and the child sets a real one after verifying the address. (GoTrue can add
    // a password to a passwordless user later, so nothing is closed off.)
    const { data: authData, error: authError } =
      await admin.auth.admin.createUser({
        email: authEmail,
        email_confirm: true,
        ...(signIn === "username" ? { password } : {}),
        user_metadata: {
          first_name: firstName,
          last_name: inheritedLastName,
          display_name: composedDisplayName,
        },
      });

    if (authError) {
      console.error("gamer creation: createUser failed", authError);
      // The one refusal in this whole route the parent can fix in place: the
      // address is already spoken for. Which of the two codes it is depends only
      // on what the parent typed — in `username` mode the address IS the
      // username, so telling them "that email is taken" would name a field the
      // form does not have. Mirrors the parent-registration route's 409.
      if (isEmailAlreadyRegistered(authError)) {
        return NextResponse.json(
          signIn === "username"
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
      return NextResponse.json(
        { error: "Something went wrong creating the gamer. Please try again." },
        { status: 400 },
      );
    }

    const gamerId = authData.user.id;

    try {
      // Step 2: Promote + link atomically. handle_new_user already seeded a
      // 'customer' profile + customer_profiles row for the new auth user; this
      // RPC swaps it to a gamer, inserts the gamer/minecraft rows, and links the
      // parent — all in one transaction, so a failure can't leave a
      // half-promoted orphan. The address the trigger copied from auth.users is
      // left untouched (gamers are email-first, whichever mode they are in).
      const { error: rpcError } = await admin.rpc("create_gamer", {
        p_gamer_id: gamerId,
        p_parent_id: user.id,
        p_first_name: firstName,
        p_last_name: inheritedLastName,
        p_date_of_birth: dateOfBirth,
        // Omit (→ undefined) rather than pass null: the RPC params default to
        // null, and the generated Args type accepts undefined, not null. A null
        // account key still inserts the row (username present, key null) on
        // either platform.
        p_gender: gender ?? undefined,
        p_minecraft_username: resolvedMinecraft?.username ?? undefined,
        p_minecraft_uuid: resolvedMinecraft?.uuid ?? undefined,
        p_roblox_username: resolvedRoblox?.username ?? undefined,
        p_roblox_user_id: resolvedRoblox?.userId ?? undefined,
        p_sign_in: signIn,
      });

      if (rpcError) {
        // The RPC ran in a transaction, so no partial gamer record persisted —
        // but the auth user we created above would now be orphaned, so delete
        // it before returning the error.
        await deleteOrphanedAuthUser(admin, gamerId);

        // One refusal here is the parent's to act on: the family holds no PIN,
        // and a gamer may not exist in a family without one because the PIN is
        // the gate on leaving a gamer session. It gets its own code so the form
        // can send them to set a PIN rather than showing them a shrug.
        if (rpcError.code === CREATE_GAMER_PIN_REQUIRED_SQLSTATE) {
          return NextResponse.json(
            {
              error: "Set a parent PIN before adding a gamer.",
              code: GAMER_PIN_REQUIRED,
            },
            { status: 403 },
          );
        }

        // Every other failure here is internal (a constraint, the promote
        // guard's raise, a connection error) — none of them is something the
        // parent can act on. Log the raw error for debugging but never surface
        // it: it's Postgres text the parent shouldn't see.
        console.error("create_gamer RPC failed", rpcError);
        return NextResponse.json(
          {
            error:
              "Something went wrong creating the gamer. Please try again.",
          },
          { status: 500 },
        );
      }
    } catch (err) {
      // A throw anywhere after the auth user was created would orphan it. The
      // RPC is transactional, so the database is already untouched; delete the
      // auth user so a retry starts from a clean slate rather than colliding or
      // piling up. The wrapper's catch then turns this into a logged 500.
      await deleteOrphanedAuthUser(admin, gamerId);
      throw err;
    }

    // The account exists, so the welcome mail follows it rather than gating it:
    // a Brevo outage must not unwind a child's account, and the parent can send
    // the link again from the child's card. Only `email` mode has anywhere to
    // send it.
    if (signIn === "email") {
      try {
        await sendGamerWelcomeEmail({
          request,
          gamerId,
          parentFirstName: parentProfile?.first_name ?? "",
        });
      } catch (mailError) {
        console.error("gamer creation: welcome email failed", mailError);
      }
    }

    // The RPC committed, so the gamer exists. Return only its id — the sole
    // thing callers consume (to pre-select the new gamer). The client
    // invalidates the gamers list on success and refetches the full row from
    // there, so there's no reason to read it back here.
    return { gamerId };
  },
});

/**
 * Whether GoTrue refused this creation because the address already has an
 * account.
 *
 * The same two-step test the parent-registration route uses, and for the same
 * reason: `email_exists` is what current GoTrue sends, and the prose fallback
 * covers a deployment (or a proxy) that drops the code.
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

// Best-effort cleanup of the auth user when post-auth creation fails. If the
// delete itself fails we can't do anything useful — but we must record it: that
// id is now a genuine orphan (an auth user with no usable gamer record), and
// this log line is the only trace of it.
async function deleteOrphanedAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  authUserId: string,
): Promise<void> {
  try {
    const { error } = await admin.auth.admin.deleteUser(authUserId);
    if (error) {
      console.error("orphaned auth user cleanup failed", authUserId, error);
    }
  } catch (cleanupErr) {
    console.error("orphaned auth user cleanup threw", authUserId, cleanupErr);
  }
}
