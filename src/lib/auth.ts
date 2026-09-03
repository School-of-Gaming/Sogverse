import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  FAMILY_SESSION_COOKIE_NAME,
  PIN_COOKIE_NAME,
  isFamilySessionTokenValid,
  isPinTokenValid,
} from "@/lib/pin-session";
import {
  sessionProvenance,
  type SessionProvenance,
} from "@/lib/session-provenance";
// Imported from the service file (not the @/services/gedu barrel) so this
// server module doesn't pull in the barrel's React Query hooks.
import { isGeduCertified } from "@/services/gedu/gedu-profiles.service";
import type { AuthenticatedUser, Profile, UserRole } from "@/types";

/**
 * The session behind a gated request, resolved once by the gate.
 *
 * Both fields come off the verified JWT, and both are put here so no route has
 * to re-read claims to get them: `id` is the `session_id` the PIN unlock cookie
 * is bound to, and `provenance` is whether this session was opened with this
 * account's own credential or handed over from another family member's
 * (`src/lib/session-provenance.ts`). The switch route reads both; nothing else
 * has to know how either is derived.
 */
export interface GatedSession {
  id: string;
  provenance: SessionProvenance;
}

/** The caller a gate hands back: their identity plus the session they hold. */
export type GatedUser = AuthenticatedUser & { session: GatedSession };

/**
 * Read a shape a cookie store satisfies. Structural rather than Next's
 * `ReadonlyRequestCookies` so a test — or a caller holding a plain map — can
 * pass one without constructing a request.
 */
export interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/**
 * Where this session came from, from the verified claims plus the switch
 * route's marker cookie.
 *
 * Exported because two gates and at least one server component need the same
 * answer and none of them should re-derive it: the marker is only meaningful
 * once validated against *this* session's `(sub, session_id)`, and a caller
 * that merely checks the cookie's presence has reintroduced the hole the marker
 * was minted to close.
 */
export async function readSessionProvenance(args: {
  claims: { sub: string; session_id: string; amr?: unknown };
  cookies: CookieReader;
}): Promise<SessionProvenance> {
  const { claims, cookies: cookieStore } = args;
  const marker = cookieStore.get(FAMILY_SESSION_COOKIE_NAME)?.value;
  return sessionProvenance({
    amr: claims.amr,
    familyMarkerValid: await isFamilySessionTokenValid(
      marker,
      claims.sub,
      claims.session_id,
    ),
  });
}

type AuthSuccess<R extends UserRole> = {
  user: GatedUser;
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
  options?: {
    forbiddenMessage?: string;
    allowUnverified?: boolean;
    requireCertifiedGedu?: boolean;
  },
): Promise<AuthSuccess<R> | NextResponse> {
  const supabase = await createClient();
  // `getClaims()` verifies the JWT locally against the project's ES256 JWKS —
  // no GoTrue round-trip (see docs/architecture/performance.md). The proxy already verified
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

  // Certified-gedu gate: a handful of gedu actions are a security boundary that
  // an uncertified gedu must not cross — creating or ending an instant voice
  // room. Opt-in per route via `requireCertifiedGedu` because most gedu routes
  // intentionally allow uncertified access (a new gedu has full platform access
  // by design; certification gates only specific actions — see
  // src/services/gedu/CLAUDE.md). Scoped to `role === "gedu"` so admins (and any
  // other allowed role) always pass. Unlike the group-assignment gate (UI-only,
  // admin-driven) this is gedu-initiated, so it must be enforced server-side.
  if (profile.role === "gedu" && options?.requireCertifiedGedu) {
    let certified: boolean;
    try {
      certified = await isGeduCertified(supabase, claims.sub);
    } catch {
      return NextResponse.json(
        { error: "Failed to load educator certification status" },
        { status: 500 },
      );
    }
    if (!certified) {
      return NextResponse.json(
        {
          error: "Your educator account is awaiting admin certification.",
          code: "GEDU_UNCERTIFIED",
        },
        { status: 403 },
      );
    }
  }

  const user: GatedUser = {
    id: claims.sub,
    email: claims.email,
    session: {
      id: claims.session_id,
      // The same cookie store the PIN gate above read, asked a second question.
      provenance: await readSessionProvenance({
        claims,
        cookies: await cookies(),
      }),
    },
  };
  return { user, profile, supabase };
}
