import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  FAMILY_SESSION_COOKIE_NAME,
  PIN_COOKIE_NAME,
  familySessionCookieOptions,
  mintFamilySessionToken,
  pinCookieOptions,
  pinTokenFor,
} from "@/lib/pin-session";
import {
  switchAccountBody,
  switchAccountResponse,
  SWITCH_PASSWORD_INVALID,
  SWITCH_PASSWORD_REQUIRED,
  SWITCH_PIN_INVALID,
  SWITCH_PIN_NOT_SET,
  SWITCH_PIN_REQUIRED,
  SWITCH_TARGET_UNREACHABLE,
  type SwitchAccountErrorCode,
} from "@/services/family/family.contracts";

/**
 * Switch the current session to another family member.
 *
 * Authorization has two halves, and both are load-bearing.
 *
 * **Who may be reached** — the family-membership matrix, unchanged:
 *
 *  - parent (`customer`) → linked gamer
 *  - gamer → linked parent (any of their parents)
 *  - gamer → sibling gamer (any gamer sharing at least one parent)
 *
 * Anything else (admin, gedu, switching to self, switching to an unrelated
 * account, missing target) returns 403 / 400. Family membership is checked with
 * the service-role client so RLS can't be tricked into leaking a link the caller
 * shouldn't see, and a target that does not exist is refused identically to one
 * outside the family, so this route cannot be used to probe for account ids.
 *
 * **What it costs** — the gate, which is new and is keyed on the caller's role
 * and the provenance of their session (`src/lib/session-provenance.ts`):
 *
 *  - **customer → gamer** is one click and no gate. A parent handing the device
 *    to a child is the gesture this route exists for, and a locked parent must
 *    be able to make it (hence `allowUnverified`).
 *  - **gamer, family session** (switched in from a parent) → a linked parent's
 *    **PIN**. This is the household case: the child is on the family's device,
 *    the parent is nearby, and the PIN is the accepted friction.
 *  - **gamer, own session** (the child signed in with their own credentials) →
 *    the **target's password**. A child may sign in on a school computer and
 *    walk away from it; a four-digit PIN with no rate limit is not what should
 *    stand between that machine and the parent's account.
 *
 * **This route is the only place a switch PIN is verified, the only place the
 * unlock cookie is minted outside the PIN routes, and the only place the
 * family-session marker is minted at all.** All three follow from the same
 * fact: the check happens while the caller is still the child, and the cookies
 * have to be bound to a session that does not exist yet. Nothing else is
 * positioned to do any of them.
 *
 * **The marker is what makes the gate above knowable.** Every session the OTP
 * path creates is a session this route handed over, and it says so by signing
 * `FAMILY_SESSION_COOKIE_NAME` against the new session's id; the password path
 * deletes it, because the person at the keyboard typed the target's own
 * credential. Nothing in a token can draw that line — a password-recovery
 * session records `otp` in `amr` exactly as a switch does — so the
 * classification is this route's own signature rather than an inference (see
 * `src/lib/session-provenance.ts`).
 *
 * The PIN is checked against `verify_pin_for_any` over the caller's linked
 * parents — a child may have more than one, and any of their PINs opens the
 * gate — through the admin client, because that function checks none of its
 * arguments against `auth.uid()`. What establishes that this caller may ask
 * about these particular parents is the membership matrix above, run first.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["customer", "gamer"],
  allowUnverified: true,
  body: switchAccountBody,
  response: switchAccountResponse,

  handler: async ({ supabase, user, profile, body }) => {
    const { userId, pin, password } = body;

    if (userId === user.id) {
      return NextResponse.json(
        { error: "Cannot switch to yourself" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, role")
      .eq("id", userId)
      .maybeSingle();

    if (targetError) throw targetError;

    // A target that does not exist and a target outside the family are the
    // same answer on purpose: 403 either way, so this route cannot be used to
    // probe which account ids exist.
    if (!target) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allowed = await isFamilyMember({
      admin,
      callerId: user.id,
      callerRole: profile.role,
      targetId: target.id,
      targetRole: target.role,
    });

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The own-session path is a different mechanism, not a different credential
    // on the same one: it signs in AS the target, so the session it produces
    // carries `password` in its own `amr` and is itself an own session.
    if (profile.role === "gamer" && user.session.provenance === "own") {
      return switchByPassword({
        admin,
        supabase,
        target,
        password,
      });
    }

    if (profile.role === "gamer") {
      const refusal = await verifyParentPin({ admin, gamerId: user.id, pin });
      if (refusal) return refusal;
    }

    // The unlock cookie is minted only for a caller who just satisfied the PIN
    // gate one step above — which is exactly the gamer callers. A parent
    // dropping to a child mints nothing, and by the matrix cannot reach a
    // customer target anyway.
    return switchByOtp({
      admin,
      supabase,
      target,
      mintUnlockCookie: profile.role === "gamer",
    });
  },
});

// ---------------------------------------------------------------------------
// Types shared by the helpers
// ---------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createAdminClient>;
type ServerClient = Awaited<ReturnType<typeof createClient>>;
// The address is deliberately NOT here: it is asked of GoTrue per switch (see
// resolveTargetEmail), so carrying the profile copy would only invite a caller
// to reach for the stale one.
type TargetProfile = { id: string; role: string | null };

/** A 403 naming which gate was not satisfied. */
function gateRefusal(code: SwitchAccountErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: message, code }, { status: 403 });
}

// ---------------------------------------------------------------------------
// Gate A — a linked parent's PIN, for a family session
// ---------------------------------------------------------------------------

/**
 * Verify the PIN against every parent this gamer is linked to, and return the
 * refusal if it does not hold. `null` means the gate is satisfied.
 *
 * Three outcomes, not two. `not_set` is a fact about the FAMILY rather than
 * about what was typed, and it is answered differently: no PIN anywhere means
 * the gate cannot be satisfied by typing more carefully, and the family is sent
 * to set one instead of being told a child got their PIN wrong.
 */
async function verifyParentPin(args: {
  admin: AdminClient;
  gamerId: string;
  pin: string | undefined;
}): Promise<NextResponse | null> {
  const { admin, gamerId, pin } = args;

  if (pin === undefined) {
    return gateRefusal(
      SWITCH_PIN_REQUIRED,
      "A parent's PIN is required to leave this account.",
    );
  }

  const { data: links, error: linkError } = await admin
    .from("parent_gamer")
    .select("parent_id")
    .eq("gamer_id", gamerId);
  if (linkError) throw linkError;

  const { data: outcome, error: pinError } = await admin.rpc(
    "verify_pin_for_any",
    {
      p_user_ids: links.map((row) => row.parent_id),
      p_pin: pin,
    },
  );
  if (pinError) throw pinError;

  if (outcome === "not_set") {
    return gateRefusal(
      SWITCH_PIN_NOT_SET,
      "No parent in this family has set a PIN yet.",
    );
  }
  if (outcome !== "valid") {
    return gateRefusal(SWITCH_PIN_INVALID, "That PIN is not correct.");
  }
  return null;
}

// ---------------------------------------------------------------------------
// The two ways a session is replaced
// ---------------------------------------------------------------------------

/**
 * The original switch: mint a magic-link OTP for the target server-side, drop
 * the caller's session, and redeem the OTP so the new cookies land in the
 * response.
 *
 * **Every session this path creates is a family session, and this is where that
 * is recorded.** The marker cookie is signed against the new session's id on
 * every OTP switch without exception — a gamer target, a parent target, a
 * parent dropping to a child. The rule is kept that simple deliberately: the
 * only alternative is a per-target condition, and a condition is a thing that
 * can be got wrong in the one place where getting it wrong hands out the
 * cheaper gate. On a parent target it is inert anyway (only a gamer caller is
 * ever charged for leaving), so narrowing it buys nothing.
 *
 * `mintUnlockCookie` is only ever true here, and only bites when the target is a
 * customer: the parent this lands on is unlocked for the life of the new
 * session, because the PIN that unlocks them was just checked one step earlier
 * and asking for it twice in one gesture is friction with nothing behind it.
 */
async function switchByOtp(args: {
  admin: AdminClient;
  supabase: ServerClient;
  target: TargetProfile;
  mintUnlockCookie: boolean;
}): Promise<{ success: true }> {
  const { admin, supabase, target, mintUnlockCookie } = args;

  const targetEmail = await resolveTargetEmail(admin, target);

  // Generate magic-link OTP first — non-destructive, safe to fail before
  // touching the caller's session.
  const { data: linkData, error: generateError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: targetEmail,
    });

  if (generateError || !linkData.properties.email_otp) {
    console.error("switch-account: generateLink failed", generateError);
    throw new ApiError("could not mint a session for the target account", 500);
  }

  const otp = linkData.properties.email_otp;

  // Sign out caller (clears session cookies), then verify OTP on a fresh
  // server client so the new cookies land in the response.
  await supabase.auth.signOut();

  const freshClient = await createClient();
  const { error: verifyError } = await freshClient.auth.verifyOtp({
    email: targetEmail,
    token: otp,
    type: "magiclink",
  });

  if (verifyError) {
    console.error("switch-account: verifyOtp failed", verifyError);
    throw new ApiError("could not establish the target session", 500);
  }

  const cookieStore = await cookies();

  // Both cookies are bound to (userId, session_id), so neither can be minted
  // until the new session exists — which is why this is here and not in the PIN
  // routes. The session id comes from the new client's own claims rather than
  // from anything the request carried.
  const { data: claimsData } = await freshClient.auth.getClaims();
  const sessionId = claimsData?.claims.session_id;

  if (sessionId) {
    cookieStore.set(
      FAMILY_SESSION_COOKIE_NAME,
      await mintFamilySessionToken(target.id, sessionId),
      familySessionCookieOptions(),
    );
  } else {
    // Unmarked reads as `own`, which is the stronger gate: whoever holds this
    // session is asked for a password rather than four digits. Worse for a
    // family that then cannot leave the account, never weaker.
    console.error("switch-account: new session carried no session_id");
    cookieStore.delete(FAMILY_SESSION_COOKIE_NAME);
  }

  if (mintUnlockCookie && target.role === "customer" && sessionId) {
    cookieStore.set(
      PIN_COOKIE_NAME,
      await pinTokenFor(target.id, sessionId),
      pinCookieOptions(),
    );
    return { success: true };
  }

  // Clear the parent-PIN unlock cookie: the new session has a different
  // session_id so the old token wouldn't match anyway, but dropping it keeps
  // the cookie jar honest. Switching INTO a gamer therefore always re-locks.
  cookieStore.delete(PIN_COOKIE_NAME);

  return { success: true };
}

/**
 * The own-session switch: sign in AS the target with their own password.
 *
 * **Why a sign-in rather than the OTP path plus a password check.** The session
 * this produces has to be an *own* session — its `amr` must carry `password` —
 * or a child who signed in on a school computer could switch to a sibling and
 * find the cheap PIN gate waiting for them on the way out of that one. Only an
 * actual `signInWithPassword` records that method, so the credential check and
 * the session creation are the same call rather than two.
 *
 * **Why the sign-in happens on the response client, before the caller is signed
 * out.** The hard constraint is that a wrong password must leave the caller
 * exactly where they were, and this order gives that for free: a failed
 * `signInWithPassword` writes no cookies at all, so there is nothing to unwind.
 * The alternative — verify on a throwaway client, sign the caller out, then sign
 * in again — costs a second password verification and leaves an orphan GoTrue
 * session behind from the throwaway. Signing in on the response client
 * overwrites the caller's cookies with the target's; the caller's now-unreachable
 * server-side session is revoked afterwards by its own access token, which is
 * the same thing `signOut()` would have done.
 *
 * **The unlock cookie is never minted here, and the family marker is deleted.**
 * A parent reached from a school computer lands on the unlock gate and pays for
 * both: the password that got here, and then the PIN. That is the point of the
 * whole path. Deleting the marker is what keeps the next switch out of this
 * session at the same price — a session opened by typing a credential is an own
 * session, and the browser must not carry into it a marker minted for the
 * session this one replaced.
 */
async function switchByPassword(args: {
  admin: AdminClient;
  supabase: ServerClient;
  target: TargetProfile;
  password: string | undefined;
}): Promise<Response | { success: true }> {
  const { admin, supabase, target, password } = args;

  // Falsy rather than `undefined`: an empty string is a password nobody set,
  // and answering it "required" is both truer and what the form needs.
  if (!password) {
    return gateRefusal(
      SWITCH_PASSWORD_REQUIRED,
      "That account's password is required to switch to it.",
    );
  }

  // A sibling in `parent` mode is switch-only and holds no password, so there is
  // no credential this path could ever accept for them. Said plainly rather than
  // answered as a wrong password: the family cannot fix it by typing, they fix
  // it by giving that child a sign-in of their own.
  if (target.role === "gamer") {
    const { data: gamerProfile, error: modeError } = await admin
      .from("gamer_profiles")
      .select("sign_in")
      .eq("user_id", target.id)
      .maybeSingle();
    if (modeError) throw modeError;
    if (!gamerProfile || gamerProfile.sign_in === "parent") {
      return gateRefusal(
        SWITCH_TARGET_UNREACHABLE,
        "That account has no sign-in of its own to switch into.",
      );
    }
  }

  const targetEmail = await resolveTargetEmail(admin, target);

  // Captured before anything replaces it, so the caller's old session can be
  // revoked once the new one is in place.
  const { data: sessionData } = await supabase.auth.getSession();
  const callerAccessToken = sessionData.session?.access_token;

  const freshClient = await createClient();
  const { error: signInError } = await freshClient.auth.signInWithPassword({
    email: targetEmail,
    password,
  });

  if (signInError) {
    // Uniform for a wrong password and for an account with no password at all —
    // the two are indistinguishable to the caller by design, so this cannot be
    // read as an oracle for which family members hold a credential.
    console.error("switch-account: password sign-in refused", signInError.code);
    return gateRefusal(SWITCH_PASSWORD_INVALID, "That password is not correct.");
  }

  // The caller's cookies are already the target's. Revoke the session those
  // cookies used to name, scoped to that one session, so the child's old refresh
  // token cannot be replayed. Best-effort: the switch has happened either way,
  // and the old cookies are gone from this browser.
  if (callerAccessToken) {
    const { error: revokeError } = await admin.auth.admin.signOut(
      callerAccessToken,
      "local",
    );
    if (revokeError) {
      console.error("switch-account: old session revoke failed", revokeError);
    }
  }

  // Never minted on this path — see the doc comment. A parent reached from an
  // own session lands locked, and clearing keeps the cookie jar honest. The
  // family marker goes with it: this session was opened by typing a credential,
  // so it is an own session and must not inherit the previous one's marker.
  const cookieStore = await cookies();
  cookieStore.delete(PIN_COOKIE_NAME);
  cookieStore.delete(FAMILY_SESSION_COOKIE_NAME);

  return { success: true };
}

/**
 * The address GoTrue knows this account by — asked of GoTrue, for every role.
 *
 * `profiles.email` is a copy, and a copy is the wrong thing to open a session
 * against. A trigger writes it on INSERT and thereafter it is kept in step by
 * whichever route moved the address; the gamer credential edit writes
 * `auth.users` first and `profiles` second, so a failure between the two leaves
 * the profile naming an address the account no longer answers to. Both calls
 * this feeds — `generateLink` and `signInWithPassword` — key on the address, so
 * a stale copy is not cosmetic drift: it is a 500 on one path and an
 * unexplainable wrong-password on the other. A gamer used to be read from the
 * profile row because a synthetic handle looked like ours to own; it is
 * GoTrue's, like everyone else's, and one admin lookup per switch is a cheap
 * price for asking the system of record.
 */
async function resolveTargetEmail(
  admin: AdminClient,
  target: TargetProfile,
): Promise<string> {
  const { data: authUser, error: authError } =
    await admin.auth.admin.getUserById(target.id);
  if (authError || !authUser.user.email) {
    console.error("switch-account: target email lookup failed", authError);
    throw new ApiError("could not resolve the target account's email", 500);
  }
  return authUser.user.email;
}

// ---------------------------------------------------------------------------
// The family-membership matrix
// ---------------------------------------------------------------------------

async function isFamilyMember(args: {
  admin: AdminClient;
  callerId: string;
  callerRole: string;
  targetId: string;
  targetRole: string | null;
}): Promise<boolean> {
  const { admin, callerId, callerRole, targetId, targetRole } = args;

  if (callerRole === "customer") {
    if (targetRole !== "gamer") return false;
    const { data, error } = await admin
      .from("parent_gamer")
      .select("id")
      .eq("parent_id", callerId)
      .eq("gamer_id", targetId)
      .maybeSingle();
    if (error) throw error;
    return !!data;
  }

  if (callerRole === "gamer") {
    if (targetRole === "customer") {
      const { data, error } = await admin
        .from("parent_gamer")
        .select("id")
        .eq("parent_id", targetId)
        .eq("gamer_id", callerId)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    }
    if (targetRole === "gamer") {
      // Sibling: caller and target must share at least one parent.
      const { data, error } = await admin
        .from("parent_gamer")
        .select("parent_id, gamer_id")
        .in("gamer_id", [callerId, targetId]);
      if (error) throw error;

      const callerParents = new Set<string>();
      const targetParents = new Set<string>();
      for (const row of data) {
        if (row.gamer_id === callerId) callerParents.add(row.parent_id);
        else if (row.gamer_id === targetId) targetParents.add(row.parent_id);
      }
      for (const p of callerParents) {
        if (targetParents.has(p)) return true;
      }
      return false;
    }
    return false;
  }

  return false;
}
