import { defineRoute } from "@/lib/api/define-route";
import { resolveRobloxRenders } from "@/lib/roblox";
import {
  robloxAvatarsQuery,
  robloxAvatarsResponse,
} from "@/services/roblox/roblox.contracts";

/**
 * GET /api/roblox/avatars — the renders for accounts whose numeric ids we
 * already hold.
 *
 * **This is the load-time path, and the verify route is the capture-time one.**
 * They look similar and are not: verification starts from a name nobody has
 * confirmed and must spend a hop turning it into an id, while this starts from
 * an id already stored against a profile — the fact, rather than the label. That
 * saves a third of the upstream calls per view, and it is what makes the cost
 * independent of how many identities are on screen: two requests whether the
 * page shows one account or a hundred.
 *
 * **Authenticated, unlike the verify route, and deliberately so.** Verification
 * has to be public because a username is checked before any account exists.
 * Nothing here does: every caller is a signed-in person looking at an identity
 * we already stored. Leaving it open would turn it into a free thumbnail proxy
 * that drains a 60-per-minute-per-IP bucket the entire fleet shares — the exact
 * budget this route's by-id shape exists to conserve.
 *
 * **No role gate, and no ownership check either, because there is nothing here
 * to own.** The inputs are Roblox's own public account ids and the outputs are
 * Roblox's own public CDN URLs; the route never touches our database, never
 * learns whose id it was handed, and answers identically for a parent, a gedu
 * and an admin. A role check would imply this can leak something about a
 * Sogverse account, and it cannot — what it *can* leak is our rate-limit budget,
 * which is what the session requirement above protects.
 */
export const GET = defineRoute({
  posture: "any-authenticated",
  reason:
    "the ids and the CDN URLs are both Roblox's own public data and no Sogverse row is read, so no role is more entitled to an answer than another — but an open route would be a free thumbnail proxy draining the per-IP rate limit the whole fleet shares, so a session is required to keep strangers off it",
  query: robloxAvatarsQuery,
  response: robloxAvatarsResponse,

  handler: async ({ query }) => {
    const resolved = await resolveRobloxRenders(query.userIds);

    // Every requested id gets an entry, including the ones with no picture — a
    // caller has to be able to tell "asked, and there is none" from "not asked",
    // because only the first means draw the silhouette and stop waiting.
    return {
      renders: Object.fromEntries(
        query.userIds.map((id) => [
          String(id),
          resolved.get(id) ?? { avatarUrl: null, headshotUrl: null },
        ]),
      ),
    };
  },
});
