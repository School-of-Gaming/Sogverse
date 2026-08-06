import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/server";
import {
  FamilyProductFeedService,
  familyProductFeedKeys,
} from "@/services/family-product-feed";
import {
  ParticipationsService,
  type MyUpcomingSessionRow,
} from "@/services/participations";
import type { SessionAudience } from "@/types";
import { FamilyProductPage } from "./FamilyProductPage";

/**
 * The server half of a family product page — the one entry point behind all six
 * of `/parent/{clubs,camps,events}/[id]` and `/gamer/{clubs,camps,events}/[id]`.
 *
 * **Why it exists: without it a direct load paints a skeleton and nothing
 * else.** The page's reads are client queries, and a client query does not run
 * during SSR, so the server's HTML would be the loading state by construction
 * and the page would only assemble itself a round trip after the JavaScript
 * arrived. Doing the same reads here and handing the results down means the
 * first frame the browser paints is the finished page.
 *
 * **Six routes share this rather than each pasting the prefetch.** They differ
 * only in their URL prefix and in which audience they are — the data behind
 * them is the same, and one copy of it is one place to fix.
 *
 * **Two mechanisms, one per read, and the difference is not arbitrary.** The
 * feed is hydrated into the query cache because its hook fetches on its own and
 * a seeded cache is what stops it; the participation rows go down as a prop
 * because their hook *requires* `initialData` — every consumer prefetches them
 * for geometry, and the hook's signature is what makes forgetting impossible.
 */
export async function FamilyProductWorkspace({
  participationId,
  audience,
}: {
  participationId: string;
  /** Which role's copy of the page this is — fixed by the URL prefix. */
  audience: SessionAudience;
}) {
  const queryClient = new QueryClient();

  // Independently settled rather than one `Promise.all` over both, so a failure
  // on either side costs only its own read. They run concurrently regardless:
  // the page blocks on the slower of the two either way.
  const [, sessionRows] = await Promise.all([
    seedFeed(queryClient, participationId),
    readSessionRows(audience),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <FamilyProductPage
        participationId={participationId}
        audience={audience}
        // `null` — the read failed — is handed on rather than flattened to
        // `[]`, so the shell can seed the cache as already stale and let the
        // client fetch the rows it could not get here.
        initialSessionRows={sessionRows}
      />
    </HydrationBoundary>
  );
}

/**
 * Fill the cache the client shell is about to read, under the key it reads.
 *
 * **The write has to name the hook's own key factory, not a literal.** A key
 * one segment off does not fail — it hydrates an entry nobody asks for, the
 * hook fetches exactly as it did before, and the whole prefetch silently buys
 * nothing. Calling the same factory the hook calls makes that impossible rather
 * than merely unlikely.
 *
 * **A refusal is seeded; a fault is not.** `unavailable` is a real answer — the
 * participation is not this caller's, or it has no group yet — and caching it
 * lets the not-found card paint on the first frame too. Anything that *throws*
 * is a failure to find out, and is left out of the cache entirely: the shell
 * then behaves exactly as it does without a prefetch, fetching on mount behind
 * its skeleton. Neither case may take the route down, because neither is
 * something the page cannot render.
 *
 * The result is plain JSON, so it dehydrates unchanged.
 */
async function seedFeed(
  queryClient: QueryClient,
  participationId: string,
): Promise<void> {
  try {
    const supabase = await createClient();
    const result = await new FamilyProductFeedService(supabase).getProductFeed(
      participationId,
    );
    queryClient.setQueryData(
      familyProductFeedKeys.feed(participationId),
      result,
    );
  } catch {
    // Left uncached deliberately — see above.
  }
}

/**
 * The viewer's active participation rows, for the enrollment's own billing
 * state: the failing-card flag and the paid-through instant a cancelled
 * membership clamps everything at.
 *
 * The whole set rather than this one row, because it is the *same read* under
 * the same cache key the dashboards use — so a click through from a badged card
 * arrives with the rows already warm, and the badge and the notice can never be
 * looking at two different answers.
 *
 * **`null` means the read failed, and that is emphatically not the same as no
 * rows.** An empty answer is a fact, and caching it as fresh is right. A
 * failure is the *absence* of an answer, and seeding it as though it were one
 * is how a cancelled enrollment silently loses its clamp: no rows means no
 * paid-through instant, which means no notice and a future block running past
 * the paid window — on a page that looks complete while being wrong, and that
 * (with a 60-second `staleTime` over seeded data) never corrects itself. The
 * distinction has to survive the trip for the shell to be able to mark the seed
 * stale, so it is carried rather than flattened.
 */
async function readSessionRows(
  audience: SessionAudience,
): Promise<MyUpcomingSessionRow[] | null> {
  try {
    const supabase = await createClient();
    return await new ParticipationsService(supabase).getMyUpcomingSessions(
      audience,
    );
  } catch {
    return null;
  }
}
