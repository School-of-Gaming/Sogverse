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
 * **Why a route serves these bytes rather than a URL**: the bucket is private,
 * and an `<img>` element cannot carry an Authorization header. A same-origin
 * fetch does carry the viewer's session cookies, so this route can do what the
 * browser cannot: call `storage.download` ON THE CALLER'S OWN client, so the
 * bucket's single SELECT policy (00231 — membership, the family time bound,
 * hidden-only-for-moderators) authorizes every read, re-answered at fetch
 * time. No admin client appears anywhere on the read path, and no signed URL
 * exists: a signed URL is a bearer token a child could copy out of a share
 * sheet and pass on for its whole lifetime (owner decision, 2026-09-01,
 * recorded in 00233's header).
 *
 * **Hiding a message therefore retracts its picture from the next fetch
 * onward.** What survives a hide is only what the viewer's browser profile
 * already cached, bounded by the cache header below: the same "they already
 * received it" exposure the hidden-body wire rule records for text.
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
 * **The bytes are cacheable for six hours, and the bound is about who is
 * looking rather than about the object.** The object itself never changes
 * (`upsert: false`, named by a primary key that cannot recur, never
 * rewritten), so the URL would happily carry `immutable` for a year — but a
 * browser cache is keyed to the *browser profile*, not to the principal, and on
 * this product a family shares one profile: switching between a parent's
 * account and their child's is a first-class flow, not an edge case. A year of
 * `immutable` would therefore serve one principal's fetch to the next with no
 * revalidation, for as long as the profile lives, past a hide and past the
 * family read window alike. **Six hours is a session-day bound** (owner
 * decision, 2026-09-01): it covers a full camp day of re-renders, remounts,
 * reloads and scrolls back up the log at no cost, and it is where the reuse
 * ends. The accepted consequence at that size: bytes a device already fetched
 * and displayed stay locally servable past a hide or the family read window for
 * up to six hours — the same already-received class the hidden-body rule
 * accepts — while every real fetch re-answers the storage policy immediately.
 * See the header on the response below for why `Vary: Cookie` cannot buy the
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
        // **Six hours, and no `immutable`.** The bytes cannot change, but the
        // question this route answers is not "what is behind this id" — it is
        // "may THIS caller have it", and a browser cache cannot tell one
        // caller from another: it is keyed to the browser profile, which a
        // family shares across an account switch. So a long-lived entry hands
        // a picture the policy admitted for a parent straight to the child who
        // switched in after them, and keeps answering past a hide and past the
        // family's read window. Six hours is the session-day bound: a full
        // camp day of re-renders, remounts and reloads costs nothing, and the
        // reuse ends there. What it accepts is that bytes a device already
        // fetched and displayed stay locally servable past a hide or the read
        // window for up to six hours — the already-received class the
        // hidden-body rule accepts — while every real fetch re-answers the
        // storage policy immediately.
        //
        // `Vary: Cookie` would be the precise fix and is not viable here: the
        // Supabase auth cookies rotate on every token refresh, so the cache
        // key would change every few minutes for a viewer whose principal
        // never did — every picture re-fetched, the header buying nothing.
        "Cache-Control": "private, max-age=21600",
      },
    });
  },
});
