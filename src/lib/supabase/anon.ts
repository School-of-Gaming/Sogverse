import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * A server-side client with the anon key and no cookies: it reads as anon
 * whoever is asking, so its answer is the same for everyone — what an
 * identity-free read (a public photo, the sitemap, a share card, public
 * reference data) needs, and what lets a route handler's answer be cached.
 * A page cannot buy caching this way while the root layout reads the session
 * on every request.
 */
export function createAnonClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
}
