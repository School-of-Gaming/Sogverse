import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findOrCreateCatalogueImage,
  readImageUpload,
  refuseUnlessPurposeSize,
} from "@/services/catalogue-images/catalogue-images.server";

/**
 * POST /api/admin/catalogue-images/[id]/replace — multipart, one `file`.
 *
 * Replace is a **repoint**, not an edit: an entry's bytes never change. The
 * new file is resolved to its own entry (created if we have not seen those
 * bytes, inheriting this entry's label so the picture keeps its name), and
 * then every link to the old entry is moved to the new one: one statement
 * for the products, and `repoint_library_covers` for the Library's covers,
 * working and published copies alike, so a live article changes picture with
 * no republish. Triggers write each served path. The new entry has the old
 * one's purpose — its object goes to that purpose's bucket — and the file must
 * be exactly that purpose's size (422 `IMAGE_WRONG_SIZE` otherwise).
 *
 * One statement per kind of user is the safety argument — every linked
 * product follows or none does, and every linked article likewise. A product
 * links only a product entry and an article only a Library cover, so for any
 * entry at most one of the two moves anything. The old entry stays in the catalogue,
 * unlinked, which is what makes a replace reversible. A failure between the
 * steps leaves a new entry some or none of the users moved to: visible,
 * harmless, and re-usable, and a retry finishes the move.
 *
 * No body schema is declared on the primitive, which is what leaves the
 * request stream untouched so the handler can read the form itself.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can manage catalogue images",
  params: z.object({ id: z.string().uuid() }),

  discloseErrorMessages:
    "the refusals here are admin-facing explanations of a rejected replace (over the size cap, not a JPEG, not the entry's purpose's exact size, an entry another admin already deleted, or a named storage/database failure) and the catalogue dialog shows them verbatim",

  handler: async ({ request, supabase, params: { id } }) => {
    const upload = await readImageUpload(request);
    if (upload instanceof NextResponse) return upload;

    // The label is read before anything is written: a replaced picture keeps
    // the name admins know it by, and a missing row is a 404 rather than a
    // pointless upload.
    const { data: current, error: readError } = await supabase
      .from("catalogue_images")
      .select("id, label, purpose")
      .eq("id", id)
      .maybeSingle();

    if (readError) throw readError;
    if (!current) {
      return NextResponse.json(
        { error: "That image is no longer in the catalogue" },
        { status: 404 },
      );
    }

    // A replacement keeps the purpose of the entry it replaces — everything
    // following the repoint may link only that purpose — so the bytes are
    // measured against the entry's purpose and stored in its bucket, and any
    // `purpose` the form carried is not consulted.
    const refused = await refuseUnlessPurposeSize(upload.file, current.purpose);
    if (refused) return refused;

    const { image } = await findOrCreateCatalogueImage({
      db: supabase,
      admin: createAdminClient(),
      file: upload.file,
      ext: upload.ext,
      contentType: upload.contentType,
      label: current.label,
      purpose: current.purpose,
    });

    // The new bytes were already this entry's bytes. Nothing to repoint, and
    // saying so is the honest answer — not an error.
    if (image.id === current.id) return { image, relinked: 0 };

    const { data: products, error: relinkError } = await supabase
      .from("products")
      .update({ image_id: image.id })
      .eq("image_id", current.id)
      .select("id");

    if (relinkError) throw relinkError;

    const { data: articles, error: coverError } = await supabase.rpc(
      "repoint_library_covers",
      { p_from: current.id, p_to: image.id },
    );

    if (coverError) throw coverError;

    return { image, relinked: products.length + articles };
  },
});
