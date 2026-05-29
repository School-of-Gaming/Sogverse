import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database.types";

export async function createClient() {
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

export async function getSession() {
  const supabase = await createClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("Error getting session:", error);
    return null;
  }

  return session;
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

// Build a `User` from verified JWT claims. Fields the JWT doesn't carry
// (notably `created_at`) are left empty — no current consumer reads them; only
// `id`/`email` flow downstream (AuthProvider seed, route handlers). Returns
// null when the token has no subject (treated as unauthenticated).
function claimsToUser(claims: VerifiedClaims): User | null {
  if (!claims.sub) {
    return null;
  }
  return {
    id: claims.sub,
    email: claims.email,
    aud: typeof claims.aud === "string" ? claims.aud : "",
    app_metadata: claims.app_metadata ?? {},
    user_metadata: claims.user_metadata ?? {},
    created_at: "",
  };
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
