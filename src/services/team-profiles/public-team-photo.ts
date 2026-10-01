import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { TEAM_PHOTOS_BUCKET } from "./team-profiles.types";

/**
 * Reading a public team profile's photo, for the photo route and the share
 * card — the two places that hand the bytes to someone with no session.
 *
 * **The bucket's own read rule is the check.** The caller passes a client
 * built with the anon key and no cookies, and the team-photos storage policy
 * lets anon read an object only while it is the current photo of an approved
 * profile of an admin or a Gedu. Listing the person's folder therefore finds
 * that one photo or nothing — an older photo still waiting to be swept, a crop
 * not yet saved, and every photo of a profile that is not public are all
 * invisible to it — so the object's name never comes from anywhere else and is
 * never handed out.
 */

/** The only types served: what the photo editor saves. */
const SERVED_TYPES = ["image/jpeg", "image/webp"] as const;
export type PublicTeamPhotoType = (typeof SERVED_TYPES)[number];

function isServedType(type: string): type is PublicTeamPhotoType {
  return (SERVED_TYPES as readonly string[]).includes(type);
}

/**
 * The content type to serve a stored photo as: the stored type when it is a
 * JPEG or a WebP, otherwise the one its name's extension says, otherwise none.
 * Never any other stored type — an SVG served from our origin runs script.
 */
function contentTypeOf(name: string, stored: string): PublicTeamPhotoType | null {
  if (isServedType(stored)) return stored;
  const lower = name.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  return null;
}

export type PublicTeamPhoto =
  | { ok: true; data: Blob; contentType: PublicTeamPhotoType }
  | { ok: false; reason: string };

/**
 * The current photo of the person's public profile, or why there is none to
 * serve: not public (or no one), hidden or replaced between the listing and
 * the download, or stored as a type that is not served.
 */
export async function readPublicTeamPhoto(
  anon: SupabaseClient<Database>,
  userId: string,
): Promise<PublicTeamPhoto> {
  const bucket = anon.storage.from(TEAM_PHOTOS_BUCKET);

  // The storage policy shows anon at most one object in the folder: the
  // current photo of a public profile.
  const listed = await bucket.list(userId);
  // A folder entry has no id; the write policy admits no subfolder anyway.
  const name = listed.data?.find((object) => object.id !== null)?.name;
  if (listed.error !== null || name === undefined) {
    return { ok: false, reason: `no public team photo for ${userId}` };
  }

  const { data, error } = await bucket.download(`${userId}/${name}`);
  if (error !== null) {
    // Hidden or replaced between the listing and the download.
    return {
      ok: false,
      reason: `public team photo for ${userId} not readable: ${error.message}`,
    };
  }

  const contentType = contentTypeOf(name, data.type);
  if (contentType === null) {
    return {
      ok: false,
      reason: `public team photo for ${userId} is not a JPEG or a WebP`,
    };
  }

  return { ok: true, data, contentType };
}
