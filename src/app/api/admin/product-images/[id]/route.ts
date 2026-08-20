import { NextResponse } from "next/server";
import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { renameProductImageBody } from "@/services/product-images/product-images.contracts";
import { PRODUCT_IMAGE_BUCKET } from "@/services/product-images/product-images.server";

const params = z.object({ id: z.string().uuid() });

const DISCLOSE_REASON =
  "the refusals here are admin-facing explanations of a rejected rename or removal (a name outside the length the column allows, an entry another admin already deleted) and the catalogue dialog shows them verbatim";

/**
 * PATCH /api/admin/product-images/[id] — JSON `{ label }`.
 *
 * The label is the only mutable thing about an entry: its bytes, its hash and
 * its path are its identity, and a product pointing at it must never find that
 * identity changed underneath.
 */
export const PATCH = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can manage product images",
  params,
  body: renameProductImageBody,
  discloseErrorMessages: DISCLOSE_REASON,

  handler: async ({ supabase, params: { id }, body }) => {
    const { data, error } = await supabase
      .from("product_images")
      .update({ label: body.label })
      .eq("id", id)
      .select("id, label, sha256, path, created_at")
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { error: "That image is no longer in the catalogue" },
        { status: 404 },
      );
    }

    return { image: data };
  },
});

/**
 * DELETE /api/admin/product-images/[id] — retire an entry.
 *
 * The row goes, the foreign key nulls every `products.image_id` pointing at
 * it, the trigger nulls each of those products' served paths, and the object
 * is removed. `unlinked` is how many products lost their picture, read before
 * the delete because afterwards there is nothing to count.
 *
 * Hard delete of row *and* object, deliberately: bytes with no row is the
 * orphan state this design exists to exclude, and re-uploading the same file
 * recreates the entry byte for byte. The one thing that stays the object's is
 * a key some *other* row has claimed in the meantime — see the removal itself.
 */
export const DELETE = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can manage product images",
  params,
  discloseErrorMessages: DISCLOSE_REASON,

  handler: async ({ supabase, params: { id } }) => {
    const { data: entry, error: readError } = await supabase
      .from("product_images")
      .select("path")
      .eq("id", id)
      .maybeSingle();

    if (readError) throw readError;
    if (!entry) {
      return NextResponse.json(
        { error: "That image is no longer in the catalogue" },
        { status: 404 },
      );
    }

    const { count, error: countError } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("image_id", id);

    if (countError) throw countError;

    const { error: deleteError } = await supabase
      .from("product_images")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    // The object is content-addressed, so between the delete above and the
    // removal below another admin may have uploaded the very same picture and
    // been handed this exact key back. That upload's row now names the object
    // we were about to remove, and removing it would leave *their* entry
    // pointing at nothing. Re-ask the table before touching the bucket, and
    // treat a failed re-ask the same way as a hit: the bytes stay, and a
    // surviving object is harmless because the next upload of them adopts it.
    const { data: reclaimed, error: reclaimError } = await supabase
      .from("product_images")
      .select("id")
      .eq("path", entry.path)
      .maybeSingle();

    if (reclaimError || reclaimed) {
      console.warn(
        "[product-images] object kept after row delete",
        entry.path,
        reclaimError
          ? "could not confirm no row still names it"
          : "another entry now names it",
      );
      return { unlinked: count ?? 0 };
    }

    // Storage and the database are separate systems and the row is already
    // gone, so a failed removal is logged rather than rolled back. What it
    // leaves is an object no row references — which the next upload of those
    // same bytes silently adopts, because the object's name IS their hash.
    const { error: removeError } = await createAdminClient()
      .storage.from(PRODUCT_IMAGE_BUCKET)
      .remove([entry.path]);

    if (removeError) {
      console.error(
        "[product-images] object removal failed after row delete",
        entry.path,
        removeError,
      );
    }

    return { unlinked: count ?? 0 };
  },
});
