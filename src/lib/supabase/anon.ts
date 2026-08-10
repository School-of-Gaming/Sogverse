import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { AppSupabaseClient } from "@/types";

/**
 * A server-side Supabase client with **no cookies attached** — the anon key and
 * nothing else. Reads through it see exactly what a signed-out visitor sees.
 *
 * It exists for one job: server work that must stay **cacheable**. Reading
 * cookies in a server render opts that render out of caching for good, because
 * the framework can no longer prove the output is the same for everyone. On a
 * high-traffic public route (a shop page's `generateMetadata`, say) that turns a
 * response that could have been shared by every visitor into a per-request
 * render, and the read it was paying for did not need an identity in the first
 * place.
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
