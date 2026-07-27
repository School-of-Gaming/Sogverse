import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PIN_COOKIE_NAME } from "@/lib/pin-session";

/** Request body of POST /api/auth/switch-account. */
const switchAccountBody = z.object({
  userId: z.string().min(1, "userId is required"),
});

/**
 * Switch the current session to another family member.
 *
 * Authorization is the load-bearing piece — only allowed within a single
 * family unit. The supported transitions are:
 *
 *  - parent (`customer`) → linked gamer
 *  - gamer → linked parent (any of their parents)
 *  - gamer → sibling gamer (any gamer sharing at least one parent)
 *
 * Anything else (admin, gedu, switching to self, switching to an unrelated
 * account, missing target) returns 403 / 400. Family membership is checked
 * with the service-role client so RLS can't be tricked into leaking a link
 * the caller shouldn't see.
 *
 * Future: gamer → parent should be gated behind a parent PIN code; tracked
 * separately and intentionally out of scope for this change.
 *
 * allowUnverified: a locked customer (no PIN entered) must still be able to
 * switch DOWN to one of their gamers — switching is how they hand the device
 * back to a child without unlocking the parent account.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["customer", "gamer"],
  allowUnverified: true,
  body: switchAccountBody,

  handler: async ({ supabase, user, profile, body }) => {
    const { userId } = body;

    if (userId === user.id) {
      return NextResponse.json(
        { error: "Cannot switch to yourself" },
        { status: 400 },
      );
    }

    const admin = createAdminClient();

    const { data: target, error: targetError } = await admin
      .from("profiles")
      .select("id, role, email")
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

    // Resolve the target's email so we can mint a magic-link OTP for it.
    // Gamer emails are synthetic (<token>@gamer.sogverse.internal) but stored on
    // the profile like any other role's, so read them straight from the row.
    // Customer emails come from auth.users (admin lookup — we don't trust the
    // cookie session, and a parent could have changed their email there).
    let targetEmail: string;
    if (target.role === "gamer") {
      if (!target.email) {
        throw new ApiError(
          `gamer ${target.id} has no synthetic email on its profile`,
          500,
        );
      }
      targetEmail = target.email;
    } else {
      const { data: authUser, error: authError } =
        await admin.auth.admin.getUserById(target.id);
      if (authError || !authUser.user.email) {
        console.error("switch-account: parent email lookup failed", authError);
        throw new ApiError("could not resolve the target account's email", 500);
      }
      targetEmail = authUser.user.email;
    }

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

    // Clear the parent-PIN unlock cookie: the new session has a different
    // session_id so the old token wouldn't match anyway, but dropping it keeps
    // the cookie jar honest. Switching INTO a parent therefore always re-locks.
    (await cookies()).delete(PIN_COOKIE_NAME);

    return { success: true };
  },
});

type AdminClient = ReturnType<typeof createAdminClient>;

async function isFamilyMember(args: {
  admin: AdminClient;
  callerId: string;
  callerRole: string;
  targetId: string;
  targetRole: string;
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
