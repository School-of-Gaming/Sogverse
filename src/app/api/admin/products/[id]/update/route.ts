import { z } from "zod";
import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { updateProductData } from "@/services/products/products.contracts";
import type { Database } from "@/types";

type RpcArgs = Database["public"]["Functions"]["update_product"]["Args"];

function friendlyRpcError(err: { code?: string; message: string }): string {
  switch (err.code) {
    case "23503": // foreign_key_violation
      return "Something you selected (the location) is no longer available. Please refresh the page and try again.";
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
 * The create route's twin, for the other post-RPC write: the product's
 * marketing ask set, which is a separate statement because it is keyed on the
 * product rather than being a column on it. A failure leaves the save itself
 * good, so it is a sentence on a 200 rather than an error.
 */
function marketingConsentsWarning(err: { message: string }): string {
  return `Product saved but its marketing consents were not applied: ${err.message}. Retry from the edit page.`;
}

/**
 * POST /api/admin/products/[id]/update — plain JSON, same shape as the create
 * route and validated on the primitive against the contract schema.
 *
 * No storage, no file, no path. A product's picture is a catalogue entry it
 * points at, so the whole image half of this route is one `image_id` write
 * after the RPC; a trigger on `products` derives the served `image_path` from
 * it, and since migration 00198 the RPC has no image parameter at all —
 * nothing but that trigger writes the column.
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
      // Unconditional, never `?? undefined`. Unlike the tag and the region lock
      // above, clearing this flag is NOT an omission: the parameter defaults to
      // FALSE because the column is NOT NULL, so omitting it would unflag the
      // product silently on an edit made for some other reason. The boolean
      // travels on every save, and the contract demands the field so it cannot
      // fail to.
      p_requires_gamer_creations: body.requires_gamer_creations,
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
      // Wipe-and-replace: the RPC hands this straight to the requirement set's
      // single writer, so an empty array clears the conditions and a populated
      // one replaces them. Never `?? undefined` — an omission here would be
      // indistinguishable from "requires nothing", and the contract demands the
      // field precisely so it cannot be one.
      p_required_consent_slugs: body.required_consent_slugs,
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

    // The create route's shape, verbatim: every write after the RPC is one the
    // product can survive failing, so each contributes a sentence rather than
    // an error, and they are collected because they are independent.
    const warnings: string[] = [];

    // Wipe-and-replace, exactly as the required consents are inside the RPC:
    // the array goes through unconditionally, so an empty one clears the asks
    // and a populated one replaces them. Never `?? undefined` — an omission
    // would be indistinguishable from "asks nothing", and the contract demands
    // the field precisely so it cannot be one.
    const { error: marketingError } = await supabase.rpc(
      "admin_set_product_marketing_consents",
      {
        p_product_id: productId,
        p_consent_types: body.marketing_consent_types,
      },
    );

    if (marketingError) {
      warnings.push(marketingConsentsWarning(marketingError));
    }

    // The picture, in one statement, after the RPC — the same image-last shape
    // the create route uses, and unconditional for the same reason: `null` is
    // "this product has no picture", an answer the form always sends, so
    // skipping the write on null would make removal impossible.
    //
    // And the same `.select("id")` for the same reason: an UPDATE matching no
    // row raises nothing, so without a returned row a vanished product would
    // come back as a clean 200 with the picture silently unapplied.
    const { data: linked, error: linkError } = await supabase
      .from("products")
      .update({ image_id: body.image_id })
      .eq("id", productId)
      .select("id");

    if (linkError) {
      warnings.push(imageLinkWarning(linkError));
    } else if (linked.length === 0) {
      warnings.push(
        imageLinkWarning({
          message: "the product could not be found when the image was applied",
        }),
      );
    }

    if (warnings.length > 0) {
      return { product_id: productId, warning: warnings.join(" ") };
    }

    return { product_id: productId };
  },
});
