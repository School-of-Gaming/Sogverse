import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * DELETE /api/admin/products/[id]/participations/[participationId]
 *
 * Admin-only un-enrollment — the inverse of the comp-enrollment POST on the
 * collection route. Hard-deletes the participation via the cancel_participation
 * RPC (reason 'admin_cancelled'), which removes the row and CASCADEs any linked
 * family_subscriptions row.
 *
 * Gated to the same product types as the add path: blocked on consumer_club,
 * where enrollment is a recurring subscription and removal must go through
 * Stripe / the parent, not an admin hard-delete.
 *
 * No refund is issued. cancel_participation only touches our DB — it never
 * calls Stripe. For the in-scope product types (camps/events one-shot, muni
 * invoiced off-platform) there is no live Stripe subscription anyway, so the
 * RPC's returned stripe_subscription_id is expected to be null and we
 * deliberately ignore it.
 *
 * Uses the admin (service-role) client: cancel_participation is granted to
 * service_role only, and participations is grant-locked against authenticated.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; participationId: string }> },
) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can remove gamers from a product",
  });
  if (result instanceof NextResponse) return result;
  const { user } = result;

  const { id: productId, participationId } = await params;

  const admin = createAdminClient();

  // IDOR guard: the participation must belong to THIS product, or a
  // participationId from another product could be cancelled via this URL.
  const { data: participation, error: fetchError } = await admin
    .from("participations")
    .select("id, product_id")
    .eq("id", participationId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 400 });
  }
  if (!participation || participation.product_id !== productId) {
    return NextResponse.json(
      { error: "Participation not found on this product" },
      { status: 404 },
    );
  }

  // Block consumer_club here as well as in the UI — defense in depth, symmetric
  // with the add-gamer gate.
  const { data: product, error: productError } = await admin
    .from("products")
    .select("product_type")
    .eq("id", productId)
    .maybeSingle();

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 400 });
  }
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  if (product.product_type === "consumer_club") {
    return NextResponse.json(
      {
        error:
          "Admin remove-gamer is not supported for consumer clubs (recurring billing). Cancel the subscription instead.",
      },
      { status: 400 },
    );
  }

  const { data: rpcResult, error: rpcError } = await admin.rpc(
    "cancel_participation",
    { p_participation_id: participationId, p_reason: "admin_cancelled" },
  );
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 400 });
  }

  // Audit trail — mirrors admin_add_gamer so we can answer "which admin
  // removed this gamer (and was anyone unenrolled who'd paid)?" later. Hosted
  // log aggregation picks this up; no DB write.
  console.info(
    JSON.stringify({
      event: "admin_remove_gamer",
      admin_id: user.id,
      product_id: productId,
      participation_id: participationId,
      result: rpcResult,
      at: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ ok: true });
}
