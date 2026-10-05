import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AppSupabaseClient } from "@/types";

/**
 * A server-side client acting as whoever holds `accessToken` — a token that
 * arrived as an `Authorization: Bearer` header rather than in a cookie, which is
 * how an MCP client presents the token Supabase Auth's OAuth server issued it.
 *
 * The anon key and the caller's token, and nothing else: every read and write
 * runs under the token's own `authenticated` role and row policies, exactly as
 * the browser client would for the same person. No session is kept or
 * refreshed, because the token is the caller's to refresh; a request that
 * outlives it fails, and the client asks for a new one.
 *
 * Constructing it proves nothing about the token. Verify it first —
 * `auth.getClaims(accessToken)` on this same client — before trusting who it
 * says it is.
 */
export function createBearerClient(accessToken: string): AppSupabaseClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
