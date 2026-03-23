import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateGamerEmail } from "@/lib/utils";

export async function POST(request: Request) {
  // 1. Authenticate as customer
  const auth = await requireRole("customer");
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  // 2. Validate request body
  let body: { gamerId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { gamerId } = body;
  if (!gamerId || typeof gamerId !== "string") {
    return NextResponse.json({ error: "gamerId is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 3. Verify parent-gamer link
  const { data: link, error: linkError } = await admin
    .from("parent_gamer")
    .select("id")
    .eq("parent_id", user.id)
    .eq("gamer_id", gamerId)
    .maybeSingle();

  if (linkError) {
    console.error("switch-to-gamer: parent_gamer lookup failed", linkError);
    return NextResponse.json({ error: "Failed to verify relationship" }, { status: 500 });
  }

  if (!link) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Verify target is a gamer and get username for synthetic email
  const { data: gamerProfile, error: profileError } = await admin
    .from("profiles")
    .select("role, username")
    .eq("id", gamerId)
    .single();

  if (profileError) {
    console.error("switch-to-gamer: gamer profile lookup failed", profileError);
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (gamerProfile.role !== "gamer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!gamerProfile.username) {
    return NextResponse.json({ error: "Gamer account is not properly configured" }, { status: 500 });
  }

  const gamerEmail = generateGamerEmail(gamerProfile.username);

  // 5. Generate magic link OTP (non-destructive — safe to do before sign-out)
  const { data: linkData, error: generateError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: gamerEmail,
  });

  if (generateError || !linkData.properties.email_otp) {
    console.error("switch-to-gamer: generateLink failed", generateError);
    return NextResponse.json({ error: "Failed to generate session" }, { status: 500 });
  }

  const otp = linkData.properties.email_otp;

  // 6. Sign out customer (clears session cookies)
  await supabase.auth.signOut();

  // 7. Create gamer session — fresh server client picks up the cookie store
  const freshClient = await createClient();
  const { error: verifyError } = await freshClient.auth.verifyOtp({
    email: gamerEmail,
    token: otp,
    type: "magiclink",
  });

  if (verifyError) {
    console.error("switch-to-gamer: verifyOtp failed", verifyError);
    return NextResponse.json({ error: "Failed to create gamer session" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
