import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
// The contracts module directly rather than the feature barrel, for the upload
// route's reason: the barrel carries browser-only React Query hooks.
import { CHAT_IMAGES_BUCKET } from "@/services/chat/chat.contracts";

/**
 * GET /api/chat/images/[id] — the bytes of one stored chat image, for a viewer
 * the bucket's policy admits.
 *
 * **Why a route serves what a URL used to**: the bucket is private, and an
 * `<img>` element cannot carry an Authorization header — which is the one and
 * only reason signed URLs ever existed on this surface. But a same-origin
 * fetch carries the viewer's session cookies, and this route can then do what
 * the browser cannot: call `storage.download` ON THE CALLER'S OWN client, so
 * the bucket's single SELECT policy (00231 — membership, the family time
 * bound, hidden-only-for-moderators) authorizes every read, re-answered at
 * fetch time. No admin client appears anywhere on the read path, no signed
 * URL is minted, and no bearer token a child could copy out of a share sheet
 * exists at all (owner decision, 2026-09-01, recorded in 00233's header).
 *
 * **Hiding a message therefore retracts its picture from the next fetch
 * onward** — stronger than the minted-URL model it replaces, whose
 * already-issued URLs kept answering for up to twelve hours. What survives a
 * hide is only what the viewer's browser profile already cached, for at most
 * the hour the cache header below allows: the same "they already received it"
 * exposure the hidden-body wire rule records for text.
 *
 * **A refusal and an absence answer identically with 404.** The policy
 * refusing a non-member, a family member past their read window, a hidden
 * message's object for a non-moderator, and an object that never landed are
 * one answer on purpose: anything finer would be an oracle for message ids
 * and hidden-state, and the client needs no distinction — it draws the same
 * quiet box either way. Clients never fetch early anyway: the container
 * renders a stored picture only once its row's `image_stored_at` flag is set,
 * which commits strictly after the object does, so "asked before the bytes
 * landed" is unreachable rather than handled.
 *
 * **The bytes are cacheable for an hour, and the hour is about who is looking
 * rather than about the object.** The object itself never changes (`upsert:
 * false`, named by a primary key that cannot recur, never rewritten), so the
 * URL would happily carry `immutable` for a year — but a browser cache is keyed
 * to the *browser profile*, not to the principal, and on this product a family
 * shares one profile: switching between a parent's account and their child's is
 * a first-class flow, not an edge case. A year of `immutable` would therefore
 * serve one principal's fetch to the next with no revalidation, for as long as
 * the profile lives, past a hide and past the family read window alike. An hour
 * keeps what caching is actually for — a re-render, a remount, a reload, the
 * scroll back up the log — free, while bounding both the cross-principal reuse
 * and the post-window reuse to something a policy change catches up with. See
 * the header on the response below for why `Vary: Cookie` cannot buy the
 * precise answer instead. `private` keeps shared caches out of it either way;
 * the CDN in front of the app never stores a child's picture.
 */
export const GET = defineRoute({
  posture: "any-authenticated",
  reason:
    "any member of the channel may read its pictures, and 'member of this channel' is a question about a row rather than a role — the same shape as the upload route's posture. The real boundary is the chat-images bucket's one storage SELECT policy, which the handler exercises by downloading on the CALLER'S OWN client: membership, the family time bound and the hidden retraction are all decided there, per fetch, and this gate only establishes that a session exists to ask as",

  params: z.object({ id: z.string().uuid() }),

  handler: async ({ params, supabase }) => {
    const { data, error } = await supabase.storage
      .from(CHAT_IMAGES_BUCKET)
      .download(params.id);

    if (error !== null) {
      // One answer for every way there is nothing to serve — see the header.
      throw new ApiError(
        `no readable chat image ${params.id} for this caller: ${error.message}`,
        404,
      );
    }

    return new Response(data, {
      headers: {
        // One format in the bucket, a property the upload route's magic-byte
        // sniff and re-encode keep deliberately — so the type is a fact about
        // the bucket, not a guess about the object.
        "Content-Type": "image/jpeg",
        // **An hour, and no `immutable`.** The bytes cannot change, but the
        // question this route answers is not "what is behind this id" — it is
        // "may THIS caller have it", and a browser cache cannot tell one
        // caller from another: it is keyed to the browser profile, which a
        // family shares across an account switch. So a long-lived entry hands
        // a picture the policy admitted for a parent straight to the child who
        // switched in after them, and keeps answering past a hide and past the
        // family's read window. An hour is short enough to bound both and long
        // enough that re-renders, remounts and reloads still cost nothing.
        //
        // `Vary: Cookie` would be the precise fix and is not viable here: the
        // Supabase auth cookies rotate on every token refresh, so the cache
        // key would change every few minutes for a viewer whose principal
        // never did — every picture re-fetched, the header buying nothing.
        "Cache-Control": "private, max-age=3600",
      },
    });
  },
});
