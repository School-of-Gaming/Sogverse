import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/types";

type AuthSuccess<R extends UserRole> = {
  user: { id: string; email?: string };
  profile: Omit<Profile, "role"> & { role: R };
  supabase: Awaited<ReturnType<typeof createClient>>;
};

/**
 * Authenticate the current user and verify their role.
 *
 * Returns `{ user, profile, supabase }` on success, or a `NextResponse`
 * (401/403/500) on failure. Callers distinguish the two with
 * `result instanceof NextResponse`.
 *
 * `profile.role` is narrowed at the type level to the union of
 * `allowedRoles` — e.g. `requireRole(["admin", "gedu"])` returns a
 * `profile.role` typed as `"admin" | "gedu"`, never wider. The `const`
 * type parameter is what lets array literals infer their literal types
 * (`["admin"]` → `R = "admin"`, not `R = UserRole`).
 */
export async function requireRole<const R extends UserRole>(
  allowedRoles: R | readonly R[],
  options?: { forbiddenMessage?: string },
): Promise<AuthSuccess<R> | NextResponse> {
  const supabase = await createClient();
  // `getClaims()` verifies the JWT locally against the project's ES256 JWKS —
  // no GoTrue round-trip (see docs/performance.md). The proxy already verified
  // and refreshed the session for this request; this is the cheap re-check.
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (claimsError || !claims?.sub) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", claims.sub)
    .single();

  if (profileError) {
    return NextResponse.json(
      { error: "Failed to load user profile" },
      { status: 500 },
    );
  }

  const roles: readonly R[] = Array.isArray(allowedRoles)
    ? allowedRoles
    : [allowedRoles as R];
  // `Array.includes` doesn't refine the input type, so the runtime check
  // is the only thing turning the wider `profile.role: UserRole` into
  // `R` here. Cast at the return seam — internal to this helper, safe
  // by construction.
  if (!roles.includes(profile.role as R)) {
    return NextResponse.json(
      { error: options?.forbiddenMessage ?? "Forbidden" },
      { status: 403 },
    );
  }

  const user = { id: claims.sub, email: claims.email };
  return { user, profile: profile as AuthSuccess<R>["profile"], supabase };
}
