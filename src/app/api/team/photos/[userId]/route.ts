import { createAnonClient } from "@/lib/supabase/anon";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
// The module directly rather than the feature barrel: the barrel carries
// browser-only React Query hooks.
import { readPublicTeamPhoto } from "@/services/team-profiles/public-team-photo";

/**
 * GET /api/team/photos/[userId]?v=<version> — the photo of one public team
 * profile, for anyone.
 *
 * **Why a route serves these bytes rather than a storage URL**: the bucket is
 * private, and stays so. A public bucket would leave a taken-down photo
 * readable by anyone holding its address; a signed URL is a bearer token that
 * outlives a take-down for as long as it lives. This route asks again on every
 * request instead.
 *
 * **The bucket's own read rule is the check.** The client is built with the
 * anon key and no cookies, so the team-photos storage policy decides the read
 * (`readPublicTeamPhoto`, which the share card reads through too).
 *
 * **Everything that is not a public photo answers 404**: a hidden profile, a
 * profile not yet made public, a person who is not staff, an id naming no one.
 * One answer, so the route says nothing about who is on the team that the
 * public team page does not already.
 *
 * **Cached publicly for five minutes**, in the browser and in the shared
 * cache, with no serving stale past that: the answer does not depend on who
 * asks, so a CDN may hold it, and five minutes is the longest a photo keeps
 * showing after its profile is hidden. `v` is the version token the public
 * read hands out with the profile; it changes whenever the photo does, so a
 * new photo is a new URL and no cache serves the old one under it. The route
 * itself ignores it and serves whatever photo is current.
 *
 * The proxy's matcher excludes this path: a publicly cacheable response must
 * never carry a refreshed session cookie (the matcher's note in
 * `src/proxy.ts`).
 */

/** Five minutes in the browser and the shared cache, and no stale serving. */
const CACHE_CONTROL = "public, max-age=300, s-maxage=300";

/**
 * The photo's own sandbox: the bytes are an image and nothing in them may run.
 * The proxy, which sets the app's CSP, never sees this path.
 */
const CONTENT_SECURITY_POLICY = "default-src 'none'; sandbox";

export const GET = defineRoute({
  posture: "public",
  reason:
    "the public team page shows each public profile's photo to anyone, signed in or not. The route reads with the anon key and no session, so the team-photos storage policy decides every read: anon may read an object only while it is the current photo of an approved admin's or Gedu's profile, re-asked on every request. Anything else answers 404, so it discloses nothing the public team page does not",

  params: z.object({ userId: z.string().uuid() }),
  query: z.object({ v: z.string().max(64).optional() }),

  handler: async ({ params }) => {
    const supabase = createAnonClient();
    const photo = await readPublicTeamPhoto(supabase, params.userId);
    if (!photo.ok) throw new ApiError(photo.reason, 404);

    return new Response(photo.data, {
      headers: {
        "Content-Type": photo.contentType,
        "Cache-Control": CACHE_CONTROL,
        "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      },
    });
  },
});
