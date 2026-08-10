import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/server";
import { AssignmentsService, assignmentKeys } from "@/services/assignments";
import { GeduSessionsService, geduSessionKeys } from "@/services/gedu-sessions";
import { GeduProductPage } from "./GeduProductPage";

/**
 * The server half of the gedu's group workspace — the one entry point behind
 * `/gedu/clubs|camps|events/[id]`.
 *
 * **Why this exists at all: a direct load of this URL used to paint a skeleton
 * and nothing else.** The two reads behind the page are client queries, and a
 * client query does not run during SSR, so the server's HTML was the loading
 * state by construction and the workspace only assembled itself a round trip
 * after the JavaScript arrived. Doing the same two reads here and handing the
 * results down as a hydrated cache means the first frame the browser paints is
 * the finished page.
 *
 * **Sequential, not parallel, and that is not an oversight.** The URL names a
 * *product*; the feed is keyed by a *group*. Which group is the caller's is
 * exactly what the first read answers, so the second cannot start until the
 * first has landed. One extra round trip on the server is still far cheaper
 * than two on the client after hydration.
 *
 * **The three routes share this rather than each pasting the prefetch.** They
 * differ only in their URL prefix and their metadata; the data they need is the
 * same, and one copy of it is one place to fix.
 */
export async function GeduProductWorkspace({
  productId,
}: {
  productId: string;
}) {
  const queryClient = new QueryClient();
  await seedWorkspace(queryClient, productId);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GeduProductPage productId={productId} />
    </HydrationBoundary>
  );
}

/**
 * Fill the cache the client shell is about to read, under the keys it reads.
 *
 * **Every write here has to name the hook's own key factory, not a literal.** A
 * key that is one segment off does not fail — it hydrates a cache entry nobody
 * asks for, the hooks fetch exactly as they did before, and the whole prefetch
 * silently buys nothing. Calling the same factory the hook calls is what makes
 * that impossible rather than merely unlikely.
 *
 * **A refused read is seeded; a broken one is not.** Both RPCs answer `null`
 * when the caller is not assigned to what they asked for — that is a real
 * answer, and caching it lets the not-assigned state paint on the first frame
 * too. Anything that *throws* is a failure to find out, and is left out of the
 * cache entirely: the shell then behaves exactly as it does today, fetching on
 * mount behind its skeleton. Neither case may take the route down, because
 * neither is something the page cannot render.
 */
async function seedWorkspace(
  queryClient: QueryClient,
  productId: string,
): Promise<void> {
  try {
    const supabase = await createClient();

    const product = await new AssignmentsService(
      supabase,
    ).getAssignedProductDetail(productId);
    queryClient.setQueryData(
      assignmentKeys.assignedProductDetail(productId),
      product,
    );
    if (product === null) return;

    const feed = await new GeduSessionsService(supabase).getGroupFeed(
      product.my_group_id,
    );
    queryClient.setQueryData(geduSessionKeys.feed(product.my_group_id), feed);
  } catch {
    // Leave whatever landed before the throw. Anything missing is fetched by
    // the shell on mount, which is the pre-prefetch behaviour and is correct —
    // just a beat slower.
  }
}
