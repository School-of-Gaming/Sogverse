import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { IMAGE_PURPOSES } from "@/lib/images/image-purposes";
import {
  readImageFile,
  reencodeForPurpose,
  type ImageIngestRefusal,
} from "@/lib/images/ingest-image.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { storeTeamPhotoResponse } from "@/services/team-profiles/team-profiles.contracts";
import { TEAM_PHOTO_URL_TTL_SECONDS } from "@/services/team-profiles/team-profiles.types";

const ROUTE_LABEL = "/api/team/profiles/[userId]/photo";

function ingestRefusal({ detail, status }: ImageIngestRefusal): ApiError {
  return new ApiError(detail, status);
}

/**
 * POST /api/team/profiles/[userId]/photo — store a new team photo in the
 * person's folder, ahead of the save that names it.
 *
 * Multipart, one `file`: the editor's crop, a JPEG at the team photo's stored
 * size. **This route is the bucket's only writer** — the bucket admits no
 * insert from a signed-in client — so what the registry says a team photo is
 * holds for every object in it: a JPEG under the byte cap, re-encoded with all
 * metadata gone, GPS included, and exactly the stored size. A picture of any
 * other size is refused, never resized: the crop is the editor's job, and a
 * picture that did not go through it is not one this route rescues.
 *
 * **Who may store is who may edit the profile**, asked of the caller's own
 * client before the form is read: their own as an admin or a Gedu, or any
 * admin's or Gedu's as an admin. The role gate in front of it turns a parent
 * or a gamer away without a database round trip.
 *
 * **The object is stored and nothing else.** The profile still names its old
 * photo until the save that names this one lands; a save the database refuses
 * removes this object again, and every landed save sweeps the folder of all
 * but the photo the profile names, which also collects an object whose save
 * never came. Both run on the caller's own client, which may delete in a folder
 * it may edit.
 *
 * Every refusal is answered with the ingest's own status. The editor shows one
 * line for any photo that did not upload, so no refusal carries a code: none
 * is reachable from the editor's crop, and none tells the person anything the
 * one line does not.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["admin", "gedu"],
  params: z.object({ userId: z.string().uuid() }),
  response: storeTeamPhotoResponse,

  handler: async ({ request, supabase, params }) => {
    // The UUID's canonical, lowercase spelling, for the check and the path
    // alike. The check casts to uuid and so accepts any case, but the folder is
    // the string as written: an uppercase one would hold an object that the
    // bucket's delete policy, the save's folder sweep and an erasure's folder
    // listing, which all spell the id in lowercase, never reach.
    const userId = params.userId.toLowerCase();

    // --- 1. Who may store into this folder ------------------------------
    const { data: mayEdit, error: authError } = await supabase.rpc(
      "can_edit_team_profile",
      { p_user_id: userId },
    );
    if (authError) {
      throw new ApiError(
        `can_edit_team_profile failed (${authError.code}): ${authError.message}`,
        500,
      );
    }
    if (mayEdit !== true) {
      throw new ApiError(`the caller may not edit ${userId}'s team profile`, 403);
    }

    // --- 2. The bytes ----------------------------------------------------
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (cause) {
      throw new ApiError(
        `the request was not multipart/form-data: ${String(cause)}`,
        400,
      );
    }
    const file = await readImageFile(formData, "team_photo");
    if (!file.ok) throw ingestRefusal(file);
    const reencoded = await reencodeForPurpose(file.value, "team_photo");
    if (!reencoded.ok) throw ingestRefusal(reencoded);

    // --- 3. The object, on the service-role client ----------------------
    //
    // A fresh name rather than the saved photo's: overwriting in place would
    // change what the profile shows before the save naming the new photo has
    // landed. `upsert: false` because a fresh UUID can only collide with
    // itself.
    const path = `${userId}/${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await createAdminClient()
      .storage.from(IMAGE_PURPOSES.team_photo.bucket)
      .upload(path, reencoded.value.bytes, {
        contentType: "image/jpeg",
        // A browser may keep the bytes as long as the signed URL that fetched
        // them lives, and no longer. The bytes behind a name never change, but
        // the photo is private: a copy cached past its URL's expiry would stay
        // viewable on that browser after the photo was replaced, removed or
        // taken down.
        cacheControl: String(TEAM_PHOTO_URL_TTL_SECONDS),
        upsert: false,
      });
    if (uploadError) {
      console.error(`[${ROUTE_LABEL}] storage upload failed for ${userId}:`, uploadError);
      throw new ApiError(
        `the photo could not be stored: ${uploadError.message}`,
        500,
      );
    }

    return { path };
  },
});
