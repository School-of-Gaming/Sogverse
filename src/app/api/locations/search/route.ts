import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { defineRoute } from "@/lib/api/define-route";
import {
  LOCATION_SEARCH_LIMIT,
  locationSearchResult,
  searchLocationsQuery,
} from "@/services/locations/locations.contracts";
import type { Database } from "@/types/database.types";

/**
 * GET /api/locations/search — the one location read a keystroke drives.
 *
 * Browsing the tree is an indexed lookup per user action and goes straight to
 * PostgREST. Search does not: the educator registration page is public and
 * types into this box before an account exists, so this is the surface an
 * anonymous visitor can hit repeatedly. It gets a route of its own for three
 * reasons, all of them about that:
 *
 *  1. **A shared cache.** The response depends only on the URL — never on who
 *     asked — so a CDN can answer the popular needles without a database round
 *     trip at all. Places are reference data; five minutes of staleness costs
 *     nothing, and `stale-while-revalidate` means even an expired entry is
 *     served instantly while it refreshes behind the request.
 *  2. **Bounds applied before Postgres sees anything.** The query schema
 *     refuses a needle under the minimum length and a page size over the cap,
 *     so a hand-rolled request cannot turn the search into a bulk export or a
 *     one-character table scan. The database enforces both again — this is the
 *     cheaper of the two places to say no.
 *  3. **A stable cache key.** Types arrive as one comma-separated parameter
 *     rather than repeated ones, so the same request is always the same URL.
 *
 * The client is built with the anon key and no cookies **on purpose**. The
 * search RPC is SECURITY INVOKER over a table whose policy grants every row to
 * `anon` and `authenticated` alike, so the answer is identical for every
 * caller; reading the session would change nothing except to make the response
 * vary per user and therefore uncacheable. "The answer does not depend on who
 * asks" is precisely what makes a public shared cache safe here.
 */

/** Five minutes in the shared cache, an hour of serving stale while it refreshes. */
const CACHE_CONTROL =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";

export const GET = defineRoute({
  posture: "public",
  reason:
    "the educator registration page asks an applicant where they can work before any account exists, so search cannot require a session. It reads only the locations reference table, every row of which anon may already SELECT directly under that table's own policy — the route narrows that surface rather than widening it, and bounds the needle length and page size on the way in",
  query: searchLocationsQuery,

  handler: async ({ query }) => {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase.rpc("search_locations", {
      p_query: query.q,
      p_types: query.types ?? undefined,
      p_limit: query.limit ?? LOCATION_SEARCH_LIMIT,
    });
    if (error) throw error;

    // The RPC returns jsonb, so the generated type is `Json`. Parsing is what
    // turns it back into the shape the caller's service declares it returns.
    return NextResponse.json(locationSearchResult.parse(data), {
      headers: { "Cache-Control": CACHE_CONTROL },
    });
  },
});
