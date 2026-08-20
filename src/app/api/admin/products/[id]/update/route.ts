import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { updateProductData } from "@/services/products/products.contracts";
import type { Database } from "@/types";

type RpcArgs = Database["public"]["Functions"]["update_product"]["Args"];

function friendlyRpcError(err: { code?: string; message: string }): string {
  switch (err.code) {
    case "23503": // foreign_key_violation
      return "Something you selected (location or holiday calendar) is no longer available. Please refresh the page and try again.";
    case "23505": // unique_violation
      return "A product with these details already exists. Please change something and try again.";
    default:
      return err.message;
  }
}

/**
 * The soft warning for a product that saved but whose picture did not get
 * linked — the create route's shape, and the same reasoning: the foreign key
 * is the case worth naming, because it means another admin removed the
 * catalogue entry this form was holding between page load and save.
 */
function imageLinkWarning(err: { code?: string; message: string }): string {
  const cause =
    err.code === "23503"
      ? "the catalogue entry no longer exists"
      : err.message;
  return `Product saved but its image was not applied: ${cause}. Retry from the edit page.`;
}

/**
 * POST /api/admin/products/[id]/update — plain JSON, same shape as the create
 * route and validated on the primitive against the contract schema.
 *
 * No storage, no file, no path. A product's picture is a catalogue entry it
 * points at, so the whole image half of this route is one `image_id` write
 * after the RPC; a trigger on `products` derives the served `image_path` from
 * it. That is also why `p_image_path` is not passed: for a linked product the
 * RPC's assignment is overwritten by the trigger, and for an unlinked one the
 * parameter's DEFAULT NULL is already the right answer.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can update products",
  params: z.object({ id: z.string().uuid() }),
  body: updateProductData,

  // Same shape as the create route: every database failure is turned into
  // admin-facing copy inside the handler, so the disclosure opt-in below only
  // ever forwards text written for an admin to read.
  discloseErrorMessages:
    "update_product's own RAISE messages are the admin-facing explanation of a refused update, and the product form shows them verbatim; the two native codes it can also raise are given written explanations first",

  handler: async ({ body, supabase, params }) => {
    const { id } = params;

    const rpcArgs: RpcArgs = {
      p_id: id,
      p_billing_mode: body.billing_mode,
      p_translations: body.translations,
      p_topic: body.topic,
      // The RPC assigns every editable column on every call, so these two have
      // to arrive on an ordinary edit or the audience would be reset by it.
      // Non-defaulted parameters are what make that a compile error rather than
      // a silent one.
      p_for_gamers: body.for_gamers,
      p_for_parents: body.for_parents,
      // Omission is how a null age reaches the column (DEFAULT NULL); the
      // audience CHECK refuses it on a product that still has a gamer audience.
      p_min_age: body.min_age ?? undefined,
      p_max_age: body.max_age ?? undefined,
      // Clearing a tag IS an omission here — the RPC assigns `tag` on every call
      // and its parameter defaults to NULL, so undefined is the only way to
      // write "untagged". That is safe only because the contract schema demands
      // the field: a caller that forgot it never reaches this line.
      p_tag: body.tag ?? undefined,
      // Unlocking IS an omission here, exactly as clearing a tag is — the RPC
      // assigns `region_lock_country` on every call and its parameter defaults
      // to NULL. Safe only because the contract demands the field: a caller
      // that forgot it never reaches this line.
      p_region_lock_country: body.region_lock_country ?? undefined,
      p_spoken_language_code: body.spoken_language_code,
      p_is_remote: body.is_remote,
      p_timezone: body.timezone,
      p_registration_opens_at: body.registration_opens_at,
      p_is_visible: body.is_visible,
      p_waitlist_enabled: body.waitlist_enabled,
      p_material_url: body.material_url ?? undefined,
      p_location_id: body.location_id ?? undefined,
      p_signup_threshold: body.signup_threshold ?? undefined,
      p_start_date: body.start_date ?? undefined,
      p_end_date: body.end_date ?? undefined,
      p_seat_count: body.seat_count ?? undefined,
      p_schedule_slots: body.schedule_slots,
      p_prices: body.prices,
      p_holiday_calendar_ids: body.holiday_calendar_ids,
      // null (unknown/none) maps to undefined so the RPC's DEFAULT NULL clears
      // the column; 0 (volunteer) survives `??` since it's not nullish.
      p_primary_gedu_fee_cents: body.primary_gedu_fee_cents ?? undefined,
      p_assistant_gedu_fee_cents: body.assistant_gedu_fee_cents ?? undefined,
      p_municipality_fee_cents: body.municipality_fee_cents ?? undefined,
    };

    const { data: productId, error: rpcError } = await supabase.rpc(
      "update_product",
      rpcArgs,
    );

    if (rpcError) {
      throw new ApiError(friendlyRpcError(rpcError), 400);
    }
    if (!productId) {
      throw new ApiError("Failed to update product", 500);
    }

    // The picture, in one statement, after the RPC — the same image-last shape
    // the create route uses, and unconditional for the same reason: `null` is
    // "this product has no picture", an answer the form always sends, so
    // skipping the write on null would make removal impossible.
    const { error: linkError } = await supabase
      .from("products")
      .update({ image_id: body.image_id })
      .eq("id", productId);

    if (linkError) {
      return {
        product_id: productId,
        warning: imageLinkWarning(linkError),
      };
    }

    return { product_id: productId };
  },
});
