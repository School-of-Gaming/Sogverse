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
 * private, and stays so. The storage policy is what decides whether a photo
 * is public at all, so a photo nobody has made public, or one already
 * replaced, is never served from an address anyone can hold.
 *
 * **The bucket's own read rule is the check.** The client is built with the
 * anon key and no cookies, so the team-photos storage policy decides the read
 * (`readPublicTeamPhoto`, which the share card reads through too).
 *
 * **Everything that is not the current public photo answers 404**: a hidden
 * profile, a profile not yet made public, a person who is not staff, an id
 * naming no one, and an address whose `v` is missing or names any version but
 * the current photo's. One answer, so the route says nothing about who is on
 * the team that the public team page does not already.
 *
 * **Only the current version is served, and it is cached for a year,
 * immutable**, in the browser, the CDN and the image optimiser, which the
 * public pages draw the photo through (owner decision, 2026-10-05). `v` is the
 * version token the public read hands out with the profile, the md5 of the
 * photo's object path; it changes whenever the photo does, so a new photo is a
 * new address. Because a stale or missing version is a 404, neither the CDN
 * nor the optimiser can ever hold a photo under any address but its own, and
 * nobody can mint further cache keys for it. The accepted cost: a page left
 * open across a photo change shows no photo until it is reloaded. Hiding a
 * profile takes it off the Team page and its profile page, and that is what
 * hidden means: a photo's address may go on serving from a cache after its
 * profile is hidden (owner ruling, 2026-10-05; making the address private
 * again on a take-down was deferred).
 *
 * The proxy's matcher excludes this path: a publicly cacheable response must
 * never carry a refreshed session cookie (the matcher's note in
 * `src/proxy.ts`). The optimiser's own path is excluded there too.
 */

/** A year everywhere: the address names the one version it serves. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

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

  handler: async ({ params, query }) => {
    if (!query.v) {
      throw new ApiError(`no photo version asked for ${params.userId}`, 404);
    }

    const supabase = createAnonClient();
    const photo = await readPublicTeamPhoto(supabase, params.userId, query.v);
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
