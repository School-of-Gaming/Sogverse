import { NextResponse } from "next/server";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findOrCreateProductImage,
  readImageUpload,
  resolveEntryLabel,
} from "@/services/product-images/product-images.server";

/**
 * POST /api/admin/product-images — multipart: one `file`, an optional `label`.
 *
 * Adds a picture to the catalogue, or answers with the entry that already
 * holds those exact bytes. `status` is which of the two happened; both are
 * success, because dedup answering "we already have this" is the feature.
 *
 * No body schema is declared on the primitive, which is what leaves the
 * request stream untouched so the handler can read the form itself.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can manage product images",

  // Everything this route can refuse is written for an admin to read: the size
  // and type refusals are sentences about the file they picked, and a storage
  // or database failure is quoted so the person who has to retry knows what
  // went wrong. The catalogue dialog shows them verbatim.
  discloseErrorMessages:
    "the refusals here are admin-facing explanations of a rejected upload (over the size cap, outside the accept list, or a named storage/database failure) and the catalogue dialog shows them verbatim",

  handler: async ({ request, supabase }) => {
    const upload = await readImageUpload(request);
    if (upload instanceof NextResponse) return upload;

    // Storage on the service-role client because the bucket has no policies;
    // the catalogue row is written on the admin's own session, where the
    // table's admin-only policy is what decides.
    const result = await findOrCreateProductImage({
      db: supabase,
      admin: createAdminClient(),
      file: upload.file,
      ext: upload.ext,
      contentType: upload.contentType,
      label: resolveEntryLabel(upload.label, upload.file.name),
    });

    return result;
  },
});
