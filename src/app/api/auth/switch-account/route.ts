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
  SWITCH_PIN_INVALID,
  SWITCH_PIN_NOT_SET,
  SWITCH_PIN_REQUIRED,
  SWITCH_SIGN_OUT_REQUIRED,
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
 * **What it costs** — the gate, keyed on the caller's role and the provenance of
 * their session (`src/lib/session-provenance.ts`):
 *
 *  - **customer → gamer** is one click and no gate. A parent handing the device
 *    to a child is the gesture this route exists for, and a locked parent must
 *    be able to make it (hence `allowUnverified`).
 *  - **gamer, family session** (switched in from a parent) → a linked parent's
 *    **PIN**. This is the household case: the child is on the family's device,
 *    the parent is nearby, and the PIN is the accepted friction.
 *  - **gamer, own session** (the child signed in with their own credentials) →
 *    **no switch at all**, 403 `SIGN_OUT_REQUIRED`. A child may sign in on a
 *    school computer and walk away from it, and this route must not be what
 *    turns that machine into a way into a parent's account. Charging the
 *    target's password instead would have made this endpoint a password oracle
 *    aimable at a family member; the way to somebody else's account is the login
 *    page, which has GoTrue's own protections behind it.
 *
 * **The own-session refusal lands after the membership matrix, and carries a
 * code but no other distinction from a target outside the family.** Running it
 * earlier would answer "this session cannot switch" for ids the caller has no
 * relationship with, and there is nothing to say about an own session before we
 * know the caller is in the family at all.
 *
 * **This route is the only place a switch PIN is verified, the only place the
 * unlock cookie is minted outside the PIN routes, and the only place the
 * family-session marker is minted at all.** All three follow from the same
 * fact: the check happens while the caller is still the child, and the cookies
 * have to be bound to a session that does not exist yet. Nothing else is
 * positioned to do any of them.
 *
 * **The marker is what makes the gate above knowable.** Every session this route
 * creates is a session it handed over, and it says so by signing
 * `FAMILY_SESSION_COOKIE_NAME` against the new session's id. Nothing in a token
 * can draw that line — a password-recovery session records `otp` in `amr`
 * exactly as a switch does — so the classification is this route's own signature
 * rather than an inference (see `src/lib/session-provenance.ts`).
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
    const { userId, pin } = body;

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

    // An own session cannot switch to anybody, and nothing in the body buys a
    // way past this — a `pin` sent here is refused exactly as an empty body is.
    // Placed after the membership matrix so it says nothing about ids the caller
    // has no relationship with, and before anything destructive so a refused
    // caller is left holding the session they arrived with.
    if (profile.role === "gamer" && user.session.provenance === "own") {
      return gateRefusal(
        SWITCH_SIGN_OUT_REQUIRED,
        "Sign out and sign in as that person to use their account.",
      );
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
// The gate — a linked parent's PIN, for a family session
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
// How the session is replaced
// ---------------------------------------------------------------------------

/**
 * The switch: mint a magic-link OTP for the target server-side, drop the
 * caller's session, and redeem the OTP so the new cookies land in the response.
 *
 * **Every session this route creates is a family session, and this is where that
 * is recorded.** The marker cookie is signed against the new session's id on
 * every switch without exception — a gamer target, a parent target, a parent
 * dropping to a child. The rule is kept that simple deliberately: the only
 * alternative is a per-target condition, and a condition is a thing that can be
 * got wrong in the one place where getting it wrong hands out the cheaper gate.
 * On a parent target it is inert anyway (only a gamer caller is ever charged for
 * leaving), so narrowing it buys nothing.
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
  const { data: verified, error: verifyError } = await freshClient.auth.verifyOtp({
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
  // routes.
  //
  // **From here to the mint, nothing may throw and nothing may leave the
  // process.** `verifyOtp` has already written the target's cookies into the
  // mutable store, so this window is one where the switch has happened: a throw
  // in it returns a 500 carrying a successful but unmarked switch, and a
  // network call in it can fail transiently and silently classify a switched-in
  // child as `own`. That rules out asking the client for its claims — that is a
  // JWKS-verifying call — so the id is read straight out of the access token
  // the call above just handed back, decoded and not verified. Verification
  // would be theatre: we minted this token one line ago and it is the token
  // this very response is about to set.
  let newSession: { sub: string; sessionId: string } | undefined;
  try {
    const claims = decodeAccessTokenPayload(verified.session?.access_token);
    if (typeof claims?.sub === "string" && typeof claims.session_id === "string") {
      newSession = { sub: claims.sub, sessionId: claims.session_id };
    }
  } catch (error) {
    console.error("switch-account: new session token could not be read", error);
  }

  // Both cookies bind `target.id`, while the id binding them comes from the new
  // session's own token — so the two are only one binding if the token names the
  // account we resolved. Asserted rather than taken from the token: binding to
  // whatever `sub` came back would make a mismatch invisible, and a session
  // belonging to somebody other than the target is not a session to hand a
  // marker to at all.
  if (newSession && newSession.sub !== target.id) {
    console.error(
      "switch-account: the new session names an account other than the target",
    );
    throw new ApiError("could not establish the target session", 500);
  }

  const sessionId = newSession?.sessionId;

  if (sessionId) {
    cookieStore.set(
      FAMILY_SESSION_COOKIE_NAME,
      await mintFamilySessionToken(target.id, sessionId),
      familySessionCookieOptions(),
    );
  } else {
    // Unmarked reads as `own`, which is the stronger gate: whoever holds this
    // session cannot switch out of it at all and has to sign in as the other
    // person. Worse for a family that has to type a credential again, never
    // weaker. This is where a token we could not read lands too, which is why
    // reading it is allowed to fail but not to throw.
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
 * The claims carried by an access token, read without verifying the signature.
 *
 * **Not verifying is the point, not a shortcut.** The one call site hands this
 * the token GoTrue returned to *this* request, for the session this response is
 * about to hand the browser — there is no third party in between whose word we
 * would be taking. Verifying it would mean a JWKS-backed check inside the
 * window between the switch happening and the marker being minted, where a
 * transient network failure would silently downgrade a switched-in child's
 * classification. Nothing here decides an authorization: the caller asserts the
 * token's `sub` against the target it already resolved rather than trusting it.
 *
 * Throws on a malformed token (bad base64, bad JSON) — the caller catches, and
 * treats an unreadable token exactly as it treats a missing session id. Written
 * inline rather than pulled from a JWT library: this is a base64url decode and
 * a `JSON.parse`, and a dependency whose reason for existing is signature
 * verification would invite somebody to turn that on.
 */
function decodeAccessTokenPayload(
  accessToken: string | undefined,
): Record<string, unknown> | undefined {
  const payload = accessToken?.split(".")[1];
  if (!payload) return undefined;

  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  // atob yields one char per byte; the claims are UTF-8, so re-decode them as
  // such rather than reading the bytes as latin1.
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));

  return isClaimsObject(parsed) ? parsed : undefined;
}

/** A decoded payload we can read claims off at all — a JSON object, not a scalar. */
function isClaimsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The address GoTrue knows this account by — asked of GoTrue, for every role.
 *
 * `profiles.email` is a copy, and a copy is the wrong thing to open a session
 * against. A trigger writes it on INSERT and thereafter it is kept in step by
 * whichever route moved the address; the gamer credential edit writes
 * `auth.users` first and `profiles` second, so a failure between the two leaves
 * the profile naming an address the account no longer answers to. `generateLink`
 * keys on the address, so a stale copy is not cosmetic drift — it is a 500 on
 * the one path this route has. A gamer used to be read from the profile row
 * because a synthetic handle looked like ours to own; it is GoTrue's, like
 * everyone else's, and one admin lookup per switch is a cheap price for asking
 * the system of record.
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
