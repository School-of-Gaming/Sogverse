import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findOrCreateCatalogueImage,
  readImageUpload,
  refuseUnlessPurposeSize,
  resolveEntryLabel,
} from "@/services/catalogue-images/catalogue-images.server";

/**
 * POST /api/admin/catalogue-images — multipart: one `file`, its `purpose`, an
 * optional `label`.
 *
 * Adds a picture to the catalogue for that purpose, or answers with the entry
 * of that purpose that already holds those exact bytes. `status` is which of
 * the two happened; both are success, because dedup answering "we already
 * have this" is the feature. The object goes to the purpose's own bucket.
 *
 * The file must be a JPEG exactly the size its purpose is stored at, measured
 * from the bytes (422 `IMAGE_WRONG_SIZE` otherwise).
 *
 * No body schema is declared on the primitive, which is what leaves the
 * request stream untouched so the handler can read the form itself.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can manage catalogue images",

  // Everything this route can refuse is written for an admin to read: the size
  // and type refusals are sentences about the file they picked, and a storage
  // or database failure is quoted so the person who has to retry knows what
  // went wrong. The catalogue dialog shows them verbatim.
  discloseErrorMessages:
    "the refusals here are admin-facing explanations of a rejected upload (over the size cap, not a JPEG, not its purpose's exact size, or a named storage/database failure) and the catalogue dialog shows them verbatim",

  handler: async ({ request, supabase }) => {
    const upload = await readImageUpload(request);
    if (upload instanceof NextResponse) return upload;

    // A new entry's purpose is the caller's to say, and never guessed from the
    // bytes: which content a picture is for is not something its size can tell.
    if (upload.purpose === null) {
      return NextResponse.json(
        { error: "Missing 'purpose' field" },
        { status: 400 },
      );
    }
    const refused = await refuseUnlessPurposeSize(upload.file, upload.purpose);
    if (refused) return refused;

    // Storage on the service-role client, the one writer the buckets'
    // guarantees are kept behind; the catalogue row is written on the admin's
    // own session, where the table's admin-only policy is what decides.
    const result = await findOrCreateCatalogueImage({
      db: supabase,
      admin: createAdminClient(),
      file: upload.file,
      ext: upload.ext,
      contentType: upload.contentType,
      label: resolveEntryLabel(upload.label, upload.file.name),
      purpose: upload.purpose,
    });

    return result;
  },
});
