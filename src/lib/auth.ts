import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types";

type AuthSuccess = {
  user: { id: string; email?: string };
  profile: Profile;
  supabase: Awaited<ReturnType<typeof createClient>>;
};

/**
 * Authenticate the current user and verify their role.
 *
 * Returns `{ user, profile, supabase }` on success, or a `NextResponse`
 * (401/403/500) on failure. Callers distinguish the two with
 * `result instanceof NextResponse`.
 */
export async function requireRole(
  allowedRoles: UserRole | UserRole[],
  options?: { forbiddenMessage?: string },
): Promise<AuthSuccess | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError) {
    return NextResponse.json(
      { error: "Failed to load user profile" },
      { status: 500 },
    );
  }

  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.includes(profile.role)) {
    return NextResponse.json(
      { error: options?.forbiddenMessage ?? "Forbidden" },
      { status: 403 },
    );
  }

  return { user, profile, supabase };
}
