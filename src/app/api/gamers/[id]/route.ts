import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 1. Authenticate caller + enforce customer role
    const result = await requireRole("customer", {
      forbiddenMessage: "Only customers can update gamer accounts",
    });
    if (result instanceof NextResponse) return result;
    const { supabase } = result;

    const { id: gamerId } = await params;

    // 2. Validate input
    const body = await request.json();
    const { displayName, password } = body;

    if (!displayName && !password) {
      return NextResponse.json(
        { error: "At least one of displayName or password is required" },
        { status: 400 },
      );
    }

    if (displayName !== undefined) {
      if (typeof displayName !== "string" || displayName.trim().length < 2) {
        return NextResponse.json(
          { error: "Display name must be at least 2 characters" },
          { status: 400 },
        );
      }
    }

    if ("password" in body) {
      if (typeof password !== "string" || password.length < 6) {
        return NextResponse.json(
          { error: "Password must be at least 6 characters" },
          { status: 400 },
        );
      }
    }

    // 3. Verify parent-child relationship via RLS-protected client
    const { data: link, error: linkError } = await supabase
      .from("parent_gamer")
      .select("id")
      .eq("parent_id", result.user.id)
      .eq("gamer_id", gamerId)
      .maybeSingle();

    if (linkError || !link) {
      return NextResponse.json(
        { error: "Not authorized to manage this gamer" },
        { status: 403 },
      );
    }

    // 4. Verify target is a gamer (defense-in-depth)
    const admin = createAdminClient();
    const { data: targetProfile, error: targetError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", gamerId)
      .single();

    if (targetError || !targetProfile || targetProfile.role !== "gamer") {
      return NextResponse.json(
        { error: "Not authorized to manage this account" },
        { status: 403 },
      );
    }

    // 5. Apply updates via admin client
    if (displayName !== undefined) {
      const trimmed = displayName.trim();

      const { error: profileError } = await admin
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", gamerId);

      if (profileError) {
        return NextResponse.json(
          { error: profileError.message },
          { status: 500 },
        );
      }

      // Best-effort: sync display name to auth metadata for Supabase dashboard visibility.
      // The profiles table is the source of truth — if this fails, the app is unaffected.
      const { error: authError } = await admin.auth.admin.updateUserById(
        gamerId,
        { user_metadata: { display_name: trimmed } },
      );

      if (authError) {
        return NextResponse.json(
          { error: authError.message },
          { status: 500 },
        );
      }
    }

    if ("password" in body) {
      const { error: pwError } = await admin.auth.admin.updateUserById(
        gamerId,
        { password },
      );

      if (pwError) {
        return NextResponse.json({ error: pwError.message }, { status: 500 });
      }
    }

    // 6. Return updated profile
    const { data: updatedProfile, error: fetchError } = await admin
      .from("profiles")
      .select("*")
      .eq("id", gamerId)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: fetchError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ gamer: updatedProfile });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
