import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PIN_COOKIE_NAME, isPinTokenValid } from "@/lib/pin-session";
import type { AuthenticatedUser, Profile, UserRole } from "@/types";

type AuthSuccess<R extends UserRole> = {
  user: AuthenticatedUser;
  profile: Omit<Profile, "role"> & { role: R };
  supabase: Awaited<ReturnType<typeof createClient>>;
};

/**
 * Narrow a profile to the allowed-roles union. `Array.includes` can't refine
 * the input type on its own, so this predicate is the one place the runtime
 * role check and the type-level narrowing are tied together.
 */
function profileHasRole<R extends UserRole>(
  profile: Profile,
  roles: readonly R[],
): profile is Profile & { role: R } {
  const allowed: readonly UserRole[] = roles;
  return allowed.includes(profile.role);
}

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
  options?: { forbiddenMessage?: string; allowUnverified?: boolean },
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

  // `typeof === "string"` (rather than Array.isArray) because roles are a
  // string union — this is the check TS can narrow `R | readonly R[]` with.
  const roles: readonly R[] =
    typeof allowedRoles === "string" ? [allowedRoles] : allowedRoles;
  if (!profileHasRole(profile, roles)) {
    return NextResponse.json(
      { error: options?.forbiddenMessage ?? "Forbidden" },
      { status: 403 },
    );
  }

  // Parent-PIN gate (mirrors the page gate in src/proxy.ts): a customer session
  // is "locked" until the parent enters their PIN. This is where it bites for
  // API routes — checkout, subscription changes, gamer management. Scoped to
  // `customer` so admin/gedu/gamer callers are never affected, even on routes
  // that allow multiple roles. `allowUnverified` opts out the handful of routes
  // a locked customer must still reach (the PIN routes, switch-account so they
  // can drop to a gamer, family/list for the profile chooser). The unlock token
  // is bound to (userId, session_id); see src/lib/pin-session.ts.
  if (profile.role === "customer" && !options?.allowUnverified) {
    const cookieStore = await cookies();
    const token = cookieStore.get(PIN_COOKIE_NAME)?.value;
    const verified = await isPinTokenValid(token, claims.sub, claims.session_id);
    if (!verified) {
      return NextResponse.json(
        { error: "PIN verification required", code: "PIN_REQUIRED" },
        { status: 403 },
      );
    }
  }

  const user = { id: claims.sub, email: claims.email };
  return { user, profile, supabase };
}
