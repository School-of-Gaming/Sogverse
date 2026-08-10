import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AppSupabaseClient } from "@/types";

/**
 * A server-side Supabase client with **no cookies attached** — the anon key and
 * nothing else. Reads through it see exactly what a signed-out visitor sees.
 *
 * It exists for reads that are **identity-free by nature** — the answer is the
 * same whoever is asking (a page's robots policy, derived from a column on the
 * row it is about). Reaching for the cookie-bound client there couples a public
 * answer to session state it never consults, and drags `cookies()` into a
 * function that has no business being request-specific.
 *
 * An honesty note on caching: this does **not** make anything cacheable today.
 * The root layout reads the session on every request, so every route in the app
 * renders dynamically regardless of what this file does. What it preserves is
 * the *option*: an identity-free read is the kind that could move into a cached
 * or prerendered segment if that ever changes, and one that reads cookies never
 * can. Don't cite caching as a present-tense payoff of using this client.
 *
 * **Only use it where an anonymous answer is the correct answer.** Anything that
 * varies by who is asking — an enrolled family's view of a product, anything
 * behind an RLS policy keyed to `auth.uid()` — must keep the cookie-bound server
 * client, or it will silently read as a stranger and quietly return nothing.
 * Design the caller so a read miss is a safe outcome rather than a wrong one.
 *
 * Declared as `AppSupabaseClient` for the same reason the cookie-bound factory
 * is: `auth.getUser()` has no business on the server path. Here it would be
 * doubly pointless — there is no session to ask about.
 */
export function createAnonClient(): AppSupabaseClient {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Nothing to persist or refresh: this client never holds a session, and
        // a background refresh timer on a server render would be a leak.
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
