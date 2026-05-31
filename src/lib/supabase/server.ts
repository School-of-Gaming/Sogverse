import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";
import type { AppSupabaseClient, AuthenticatedUser } from "@/types";

// Declared to return `AppSupabaseClient`, not the raw `SupabaseClient<Database>`:
// the server client deliberately exposes no `auth.getUser()` (see the type's doc
// in src/types/index.ts). Server identity comes from `getClaims()` — the helpers
// below, the proxy, and `requireRole`. The full client `createServerClient`
// builds satisfies the narrower type, so the narrowing is just this annotation;
// everything downstream sees the `getUser`-free surface.
export async function createClient(): Promise<AppSupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

// `getClaims()` verifies the access token locally against the project's
// published ES256 JWKS — no GoTrue round-trip, unlike `getUser()` (see
// docs/performance.md, the getUser→getClaims migration). The proxy remains the
// single token-refresh point, so by the time these helpers run the request's
// cookie already holds a fresh token to verify.
type ServerClient = Awaited<ReturnType<typeof createClient>>;
type VerifiedClaims = NonNullable<
  Awaited<ReturnType<ServerClient["auth"]["getClaims"]>>["data"]
>["claims"];

// Build the verified identity from JWT claims. A locally-verified token only
// carries `sub`/`email` — not the fully-populated GoTrue `User` — so this
// returns the honest `AuthenticatedUser` subset rather than fabricating the
// rest of `User`. Returns null when the token has no subject (treated as
// unauthenticated).
function claimsToUser(claims: VerifiedClaims): AuthenticatedUser | null {
  if (!claims.sub) {
    return null;
  }
  return { id: claims.sub, email: claims.email };
}

export async function getUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    return null;
  }

  return claimsToUser(data.claims);
}

export async function getUserWithProfile() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const user = data?.claims ? claimsToUser(data.claims) : null;

  if (error || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("Error fetching profile:", profileError);
    return { user, profile: null };
  }

  return { user, profile };
}
