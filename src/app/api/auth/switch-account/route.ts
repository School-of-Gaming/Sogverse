import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateGamerEmail } from "@/lib/utils";
import { PIN_COOKIE_NAME } from "@/lib/pin-session";

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
 */
export async function POST(request: Request) {
  // allowUnverified: a locked customer (no PIN entered) must still be able to
  // switch DOWN to one of their gamers — switching is how they hand the device
  // back to a child without unlocking the parent account.
  const auth = await requireRole(["customer", "gamer"], { allowUnverified: true });
  if (auth instanceof NextResponse) return auth;
  const { user, profile, supabase } = auth;

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId } = body;
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  if (userId === user.id) {
    return NextResponse.json({ error: "Cannot switch to yourself" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, role, username")
    .eq("id", userId)
    .maybeSingle();

  if (targetError) {
    console.error("switch-account: target lookup failed", targetError);
    return NextResponse.json({ error: "Failed to verify target" }, { status: 500 });
  }

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

  if (allowed instanceof NextResponse) return allowed;
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Resolve the target's email so we can mint a magic-link OTP for it.
  // Gamer emails are synthetic and derived from username; customer emails
  // come from auth.users (admin lookup — we don't trust the cookie session
  // for this).
  let targetEmail: string;
  if (target.role === "gamer") {
    if (!target.username) {
      return NextResponse.json(
        { error: "Gamer account is not properly configured" },
        { status: 500 },
      );
    }
    targetEmail = generateGamerEmail(target.username);
  } else {
    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(target.id);
    if (authError || !authUser.user.email) {
      console.error("switch-account: parent email lookup failed", authError);
      return NextResponse.json({ error: "Failed to look up target email" }, { status: 500 });
    }
    targetEmail = authUser.user.email;
  }

  // Generate magic-link OTP first — non-destructive, safe to fail before
  // touching the caller's session.
  const { data: linkData, error: generateError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: targetEmail,
  });

  if (generateError || !linkData.properties.email_otp) {
    console.error("switch-account: generateLink failed", generateError);
    return NextResponse.json({ error: "Failed to generate session" }, { status: 500 });
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
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  // Clear the parent-PIN unlock cookie: the new session has a different
  // session_id so the old token wouldn't match anyway, but dropping it keeps
  // the cookie jar honest. Switching INTO a parent therefore always re-locks.
  (await cookies()).delete(PIN_COOKIE_NAME);

  return NextResponse.json({ success: true });
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function isFamilyMember(args: {
  admin: AdminClient;
  callerId: string;
  callerRole: string;
  targetId: string;
  targetRole: string;
}): Promise<boolean | NextResponse> {
  const { admin, callerId, callerRole, targetId, targetRole } = args;

  if (callerRole === "customer") {
    if (targetRole !== "gamer") return false;
    const { data, error } = await admin
      .from("parent_gamer")
      .select("id")
      .eq("parent_id", callerId)
      .eq("gamer_id", targetId)
      .maybeSingle();
    if (error) {
      console.error("switch-account: parent_gamer lookup failed", error);
      return NextResponse.json({ error: "Failed to verify relationship" }, { status: 500 });
    }
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
      if (error) {
        console.error("switch-account: parent_gamer lookup failed", error);
        return NextResponse.json({ error: "Failed to verify relationship" }, { status: 500 });
      }
      return !!data;
    }
    if (targetRole === "gamer") {
      // Sibling: caller and target must share at least one parent.
      const { data, error } = await admin
        .from("parent_gamer")
        .select("parent_id, gamer_id")
        .in("gamer_id", [callerId, targetId]);
      if (error) {
        console.error("switch-account: sibling lookup failed", error);
        return NextResponse.json({ error: "Failed to verify relationship" }, { status: 500 });
      }
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
