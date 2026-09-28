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
  groupIdParam,
}: {
  productId: string;
  /**
   * The URL's `?groupId=`, exactly as Next hands it over — a string, a repeated
   * param's array, or nothing.
   *
   * **A substitution card's link is what carries it.** A gedu substituting one afternoon
   * of a group they are not assigned to has no assignment row to resolve a
   * group from, and one substituting a *sibling* group of a product they already
   * teach would otherwise be sent to their own group's workspace — the right
   * product, the wrong roster.
   *
   * It is parsed here rather than in each of the three routes, so there is one
   * copy of the rule: anything that is not a single uuid is **ignored** rather
   * than rejected, because the path is what has to resolve and the param is a
   * lens over a page that exists. A uuid naming a group the caller can reach
   * neither by assignment nor by a live substitution is refused by the RPC, which
   * renders the ordinary not-yours state.
   */
  groupIdParam?: string | string[];
}) {
  const groupId = parseGroupId(groupIdParam);
  const queryClient = new QueryClient();
  await seedWorkspace(queryClient, productId, groupId);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <GeduProductPage
        productId={productId}
        groupId={groupId}
        viewerId={await viewerId()}
      />
    </HydrationBoundary>
  );
}

/**
 * A `?groupId=` that is a single uuid, or `null`.
 *
 * Shape-checked rather than merely non-empty: the value is handed straight to a
 * `uuid` RPC parameter, and Postgres answers a malformed one with a 22P02 that
 * would take the whole page down instead of rendering it on the caller's own
 * group. A repeated param is a URL nobody meant to build and is ignored whole.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseGroupId(raw: string | string[] | undefined): string | null {
  return typeof raw === "string" && UUID_PATTERN.test(raw) ? raw : null;
}

/**
 * Who is reading the workspace, resolved on the server.
 *
 * The page's session staffing needs it: the document says who is expected and
 * who filed which absence, but not which of those people is at the keyboard —
 * and that is what decides whether a card offers "I can't make this session".
 *
 * **Resolved here rather than read from a client auth context**, so it is
 * settled before the first paint and the server render and the first client
 * render cannot disagree about whose workspace this is. `null` on a failure to
 * find out, which offers nothing rather than offering the wrong person's
 * absence — and the proxy has already established that somebody is signed in,
 * so it is not a state the page is expected to meet.
 */
async function viewerId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    return data?.claims.sub ?? null;
  } catch {
    return null;
  }
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
  groupId: string | null,
): Promise<void> {
  try {
    const supabase = await createClient();

    const product = await new AssignmentsService(
      supabase,
    ).getAssignedProductDetail(productId, groupId);
    // The group id is a segment of the key as well as an argument of the call,
    // so a seed made for one group cannot be handed to a page asking about
    // another — see the key factory's own note.
    queryClient.setQueryData(
      assignmentKeys.assignedProductDetail(productId, groupId),
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
