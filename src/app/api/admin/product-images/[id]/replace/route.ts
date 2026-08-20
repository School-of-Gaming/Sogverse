import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findOrCreateProductImage,
  readImageUpload,
} from "@/services/product-images/product-images.server";

/**
 * POST /api/admin/product-images/[id]/replace — multipart, one `file`.
 *
 * Replace is a **repoint**, not an edit: an entry's bytes never change. The
 * new file is resolved to its own entry (created if we have not seen those
 * bytes, inheriting this entry's label so the picture keeps its name), and
 * then one statement points every product that used the old entry at the new
 * one. The trigger on `products` writes each product's served path.
 *
 * One statement is the whole safety argument — every linked product follows or
 * none does. The old entry stays in the catalogue, unlinked, which is what
 * makes a replace reversible. A failure between the two steps leaves a new
 * unused entry: visible, harmless, and re-usable.
 *
 * No body schema is declared on the primitive, which is what leaves the
 * request stream untouched so the handler can read the form itself.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can manage product images",
  params: z.object({ id: z.string().uuid() }),

  discloseErrorMessages:
    "the refusals here are admin-facing explanations of a rejected replace (over the size cap, outside the accept list, an entry another admin already deleted, or a named storage/database failure) and the catalogue dialog shows them verbatim",

  handler: async ({ request, supabase, params: { id } }) => {
    const upload = await readImageUpload(request);
    if (upload instanceof NextResponse) return upload;

    // The label is read before anything is written: a replaced picture keeps
    // the name admins know it by, and a missing row is a 404 rather than a
    // pointless upload.
    const { data: current, error: readError } = await supabase
      .from("product_images")
      .select("id, label")
      .eq("id", id)
      .maybeSingle();

    if (readError) throw readError;
    if (!current) {
      return NextResponse.json(
        { error: "That image is no longer in the catalogue" },
        { status: 404 },
      );
    }

    const { image } = await findOrCreateProductImage({
      db: supabase,
      admin: createAdminClient(),
      file: upload.file,
      ext: upload.ext,
      contentType: upload.contentType,
      label: current.label,
    });

    // The new bytes were already this entry's bytes. Nothing to repoint, and
    // saying so is the honest answer — not an error.
    if (image.id === current.id) return { image, relinked: 0 };

    const { data: relinked, error: relinkError } = await supabase
      .from("products")
      .update({ image_id: image.id })
      .eq("image_id", current.id)
      .select("id");

    if (relinkError) throw relinkError;

    return { image, relinked: relinked.length };
  },
});
