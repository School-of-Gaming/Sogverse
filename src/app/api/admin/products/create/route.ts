import { defineRoute } from "@/lib/api/define-route";
import { ApiError } from "@/lib/api/api-error";
import { createProductData } from "@/services/products/products.contracts";
import type { Database } from "@/types";

type RpcArgs = Database["public"]["Functions"]["create_product"]["Args"];

function friendlyRpcError(err: { code?: string; message: string }): string {
  switch (err.code) {
    case "23503": // foreign_key_violation
      return "Something you selected (location or holiday calendar) is no longer available. Please refresh the page and try again.";
    case "23505": // unique_violation
      return "A product with these details already exists. Please change something and try again.";
    default:
      // RAISE EXCEPTION messages from our own RPCs are already friendly
      // ("Only admins can create products", "At least one translation is
      // required", etc.). Pass them through.
      return err.message;
  }
}

/**
 * The soft warning for a product that saved but whose picture did not get
 * linked. The foreign key is the case worth naming: it means the catalogue
 * entry this form was holding has been removed since the page loaded, which is
 * an ordinary race between two admins and not something the admin did wrong.
 */
function imageLinkWarning(err: { code?: string; message: string }): string {
  const cause =
    err.code === "23503"
      ? "the catalogue entry no longer exists"
      : err.message;
  return `Product created but its image was not applied: ${cause}. Retry from the edit page.`;
}

/**
 * The same soft warning for the other write that happens after the RPC: the
 * product's marketing ask set.
 *
 * It is a second statement for a structural reason rather than a stylistic one
 * — the set is keyed on a product id that `create_product` is what produces, so
 * there is nothing to key it on until the RPC has returned. That makes it the
 * image link's twin: the product exists and is editable, so a failure here is a
 * warning on a 200, never an error that would report a good save as a bad one.
 *
 * It carries no code-specific copy because it has no interesting code to name.
 * The writer's own RAISEs (an unknown product, a NULL in the array) are already
 * sentences, and neither is reachable from this route with a body the contract
 * schema accepted.
 */
function marketingConsentsWarning(err: { message: string }): string {
  return `Product created but its marketing consents were not applied: ${err.message}. Retry from the edit page.`;
}

/**
 * POST /api/admin/products/create — plain JSON, validated on the primitive
 * against the same contract schema the calling service builds its body from.
 *
 * The picture is an id, not a file: catalogue entries are uploaded through
 * their own route, and a product only ever points at one. `image_id` is
 * written in a second statement after the RPC (the image-last pattern this
 * route already used), and a database trigger derives the served `image_path`
 * column from it — so nothing here touches storage and nothing here writes a
 * path.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: "admin",
  forbiddenMessage: "Only admins can create products",
  body: createProductData,

  // Every database failure here is turned into admin-facing copy before it
  // leaves the handler: the two native codes get written explanations, and our
  // own RPC's RAISE messages already are the explanation. That is what the
  // disclosure opt-in below covers — no raw driver text reaches the client,
  // because nothing raw is thrown past this handler.
  discloseErrorMessages:
    "create_product's own RAISE messages are the admin-facing explanation of a refused create, and the product form shows them verbatim; the two native codes it can also raise are given written explanations first",

  handler: async ({ body, supabase }) => {
    // Build RPC args. Nullable fields go in as undefined so the RPC uses its
    // DEFAULT NULL. Semantic validation beyond the contract schema's shapes
    // lives in the DB (CHECK constraints + location trigger on products).
    const rpcArgs: RpcArgs = {
      p_product_type: body.product_type,
      p_billing_mode: body.billing_mode,
      p_translations: body.translations,
      p_topic: body.topic,
      // Non-defaulted on the RPC, so they are unconditional here: a product's
      // audience is never inferred from an omission.
      p_for_gamers: body.for_gamers,
      p_for_parents: body.for_parents,
      // Absent ages are an omission, not a NULL argument — the RPC's DEFAULT
      // NULL is what writes the null, and the audience CHECK is what makes a
      // missing age on a for-gamers product fail loudly instead of silently.
      p_min_age: body.min_age ?? undefined,
      p_max_age: body.max_age ?? undefined,
      // Untagged is an omission for the same reason an absent age is: the RPC's
      // DEFAULT NULL writes the null. What keeps the omission deliberate is the
      // contract schema, which requires the field and admits an explicit null.
      p_tag: body.tag ?? undefined,
      // Unlocked is an omission for the same reason untagged is. The contract
      // both requires the field and narrows it to a seeded country, so this is
      // also the last place the code is checked — nothing downstream of here
      // re-reads it, because the lock is enforced in the shop's UI alone.
      p_region_lock_country: body.region_lock_country ?? undefined,
      // Unconditional, never `?? undefined` — the parameter defaults to FALSE
      // rather than to NULL (the column is NOT NULL), so an omission would not
      // mean "no answer", it would mean "unflagged". Passing the boolean
      // through keeps this line identical to the update route's, where the same
      // omission would clear a flag an admin set.
      p_requires_gamer_creations: body.requires_gamer_creations,
      p_spoken_language_code: body.spoken_language_code,
      p_is_remote: body.is_remote,
      p_timezone: body.timezone,
      p_status: body.status,
      p_is_visible: body.is_visible,
      p_waitlist_enabled: body.waitlist_enabled,
      p_material_url: body.material_url ?? undefined,
      p_location_id: body.location_id ?? undefined,
      p_signup_threshold: body.signup_threshold ?? undefined,
      p_start_date: body.start_date ?? undefined,
      p_end_date: body.end_date ?? undefined,
      p_seat_count: body.seat_count ?? undefined,
      p_registration_opens_at: body.registration_opens_at,
      p_schedule_slots: body.schedule_slots,
      p_prices: body.prices,
      p_holiday_calendar_ids: body.holiday_calendar_ids,
      // The enrolment conditions, unconditionally and as an array — never
      // `?? undefined`. An empty array is the ordinary "requires nothing", the
      // RPC reads it exactly as it reads NULL, and passing it through keeps this
      // line identical to the update route's, where an omission would drop a
      // product's requirement set instead of clearing it deliberately.
      p_required_consent_slugs: body.required_consent_slugs,
      p_primary_gedu_fee_cents: body.primary_gedu_fee_cents ?? undefined,
      p_assistant_gedu_fee_cents: body.assistant_gedu_fee_cents ?? undefined,
      p_municipality_fee_cents: body.municipality_fee_cents ?? undefined,
    };

    // Call the RPC through the user's session client — SECURITY INVOKER means
    // the role lookup needs auth.uid() populated. RLS on each table gates the
    // inserts; the explicit admin check inside the RPC is belt-and-suspenders.
    const { data: productId, error: rpcError } = await supabase.rpc(
      "create_product",
      rpcArgs,
    );

    if (rpcError) {
      // The form validates everything client-side, so RPC errors here are
      // mostly race conditions (an admin deleted a location / holiday calendar
      // between page load and submit).
      throw new ApiError(friendlyRpcError(rpcError), 400);
    }
    if (!productId) {
      throw new ApiError("Failed to create product", 500);
    }

    // Everything after the RPC is a write the product can survive failing, so
    // each one contributes a sentence rather than an error. They are collected
    // instead of returned early because they are independent: a product whose
    // picture and whose marketing asks both failed to land should say so twice.
    const warnings: string[] = [];

    // The marketing ask set, unconditionally and as an array — never
    // `?? undefined`, exactly as the enrolment conditions are passed to the RPC
    // above. An empty array is the ordinary "asks nothing", the writer reads it
    // as it reads NULL, and passing it keeps this line identical to the update
    // route's, where an omission would leave a stale set behind.
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

    // Image-last: the product exists and is editable, so a failure to link its
    // picture is a warning on a 200 rather than an error that hides a good
    // save. Written unconditionally — `null` is the ordinary "no picture"
    // answer, not an omission — and never as a bare 200 on failure.
    //
    // `.select("id")` is what makes "never a bare 200" structural rather than
    // hopeful: a filtered UPDATE that matches no row is a perfectly successful
    // statement with no error to catch, so the returned row is the only
    // evidence the write landed.
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
