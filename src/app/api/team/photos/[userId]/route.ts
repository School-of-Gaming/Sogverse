import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
// The types module directly rather than the feature barrel: the barrel carries
// browser-only React Query hooks.
import { TEAM_PHOTOS_BUCKET } from "@/services/team-profiles/team-profiles.types";
import type { Database } from "@/types/database.types";

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
 * anon key and no cookies, and the team-photos storage policy lets anon read
 * an object only while it is the current photo of an approved profile of an
 * admin or a Gedu. Listing the person's folder therefore finds that one photo
 * or nothing — an older photo still waiting to be swept, a crop not yet saved,
 * and every photo of a profile that is not public are all invisible to it — so
 * the route never needs the object's name from anywhere else, and never hands
 * it out.
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

/** The only types the route serves: what the photo editor saves. */
const SERVED_TYPES = ["image/jpeg", "image/webp"] as const;
type ServedType = (typeof SERVED_TYPES)[number];

function isServedType(type: string): type is ServedType {
  return (SERVED_TYPES as readonly string[]).includes(type);
}

/**
 * The content type to serve a stored photo as: the stored type when it is a
 * JPEG or a WebP, otherwise the one its name's extension says, otherwise none.
 * Never any other stored type — an SVG served from our origin runs script.
 */
function contentTypeOf(name: string, stored: string): ServedType | null {
  if (isServedType(stored)) return stored;
  const lower = name.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

export const GET = defineRoute({
  posture: "public",
  reason:
    "the public team page shows each public profile's photo to anyone, signed in or not. The route reads with the anon key and no session, so the team-photos storage policy decides every read: anon may read an object only while it is the current photo of an approved admin's or Gedu's profile, re-asked on every request. Anything else answers 404, so it discloses nothing the public team page does not",

  params: z.object({ userId: z.string().uuid() }),
  query: z.object({ v: z.string().max(64).optional() }),

  handler: async ({ params }) => {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const bucket = supabase.storage.from(TEAM_PHOTOS_BUCKET);

    // The storage policy shows anon at most one object in the folder: the
    // current photo of a public profile.
    const listed = await bucket.list(params.userId);
    // A folder entry has no id; the write policy admits no subfolder anyway.
    const name = listed.data?.find((object) => object.id !== null)?.name;
    if (listed.error !== null || name === undefined) {
      throw new ApiError(`no public team photo for ${params.userId}`, 404);
    }

    const { data, error } = await bucket.download(`${params.userId}/${name}`);
    if (error !== null) {
      // Hidden or replaced between the listing and the download.
      throw new ApiError(
        `public team photo for ${params.userId} not readable: ${error.message}`,
        404,
      );
    }

    const contentType = contentTypeOf(name, data.type);
    if (contentType === null) {
      throw new ApiError(
        `public team photo for ${params.userId} is not a JPEG or a WebP`,
        404,
      );
    }

    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_CONTROL,
        "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      },
    });
  },
});
