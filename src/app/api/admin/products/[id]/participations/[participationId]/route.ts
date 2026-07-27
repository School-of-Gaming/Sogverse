import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/json-body.server";
import {
  adminRemoveParticipationRpcResult,
  demoteToWaitlistRpcResult,
  promoteFromWaitlistRpcResult,
  waitlistTransitionBody,
} from "@/services/participations/participations.contracts";

/**
 * DELETE /api/admin/products/[id]/participations/[participationId]
 *
 * Admin-only un-enrollment — the inverse of the comp-enrollment POST on the
 * collection route. Hard-deletes the participation, which CASCADEs any linked
 * family_subscriptions row.
 *
 * Model C, like every other handler in this file: `participations` is
 * grant-locked, so the write goes through `admin_remove_participation`, an
 * admin-guarded SECURITY DEFINER RPC. Three preconditions live inside it rather
 * than here, and each is safer there than it was in TypeScript:
 *
 *  - the participation must be on THIS product (an id from another product
 *    could otherwise be cancelled through this URL);
 *  - consumer clubs are refused, where removal must go through Stripe and the
 *    parent rather than an admin hard-delete;
 *  - a participation with a live Stripe subscription is refused, because the
 *    CASCADE would orphan a subscription that keeps billing the customer with
 *    no DB record and no refund. In the RPC that check shares a transaction and
 *    a product lock with the delete, so unlike the route-level version it has no
 *    window between checking and deleting. It is unreachable under current
 *    invariants — only consumer_club ever has a live sub — and stays as the
 *    thing that fails loud if that ever changes.
 *
 * No refund is issued: nothing here calls Stripe.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; participationId: string }> },
) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can remove gamers from a product",
  });
  if (result instanceof NextResponse) return result;
  const { supabase, user } = result;

  const { id: productId, participationId } = await params;

  const { data, error } = await supabase.rpc("admin_remove_participation", {
    p_product_id: productId,
    p_participation_id: participationId,
  });

  if (error) {
    if (error.code === "42501") {
      return NextResponse.json(
        { error: "Only admins can remove gamers from a product" },
        { status: 403 },
      );
    }
    if (error.code === "P0002") {
      return NextResponse.json(
        { error: "Participation not found on this product" },
        { status: 404 },
      );
    }
    // 55000 (object_not_in_prerequisite_state) is the live-subscription
    // refusal. It means an invariant we believe holds has stopped holding, so
    // it is logged at error level with the identifiers needed to chase it.
    if (error.code === "55000") {
      console.error(
        JSON.stringify({
          event: "admin_remove_gamer_blocked_live_subscription",
          admin_id: user.id,
          product_id: productId,
          participation_id: participationId,
          detail: error.message,
          at: new Date().toISOString(),
        }),
      );
      return NextResponse.json(
        {
          error:
            "This participation has a live Stripe subscription and can't be removed here. Cancel the subscription first.",
        },
        { status: 500 },
      );
    }
    if (error.code === "23514") {
      return NextResponse.json(
        {
          error:
            "Admin remove-gamer is not supported for consumer clubs (recurring billing). Cancel the subscription instead.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const parsed = adminRemoveParticipationRpcResult.safeParse(data);
  if (!parsed.success) {
    console.error(
      "admin_remove_participation returned an unexpected shape:",
      parsed.error.message,
    );
    return NextResponse.json(
      { error: "Failed to remove gamer" },
      { status: 500 },
    );
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
      result: parsed.data,
      at: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/admin/products/[id]/participations/[participationId]
 *
 * Admin waitlist status transitions from the groups-panel drag UI:
 *  - `promote` — a waitlisted gamer dragged into a group/unassigned. Gives them
 *    a seat via promote_from_waitlist (status→active, group set, waitlisted_at
 *    cleared). No seat-count gate — a deliberate admin capacity override.
 *  - `demote` — an active gamer dragged onto the waitlist. Sends them to the
 *    back via demote_to_waitlist (status→waitlisted, group cleared).
 *
 * Same shape as the DELETE handler above: the user-context client against an
 * admin-guarded RPC. Both RPCs re-check the caller's role internally (like
 * apply_group_changes, their drag-UI sibling), so they must run with the
 * caller's JWT — a service-role call has no auth.uid() and would be Forbidden.
 *
 * Gated to the same product types as add/remove: blocked on consumer_club,
 * where promotion would mean an unbilled active seat and demotion would strand
 * a paying subscriber on the waitlist.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; participationId: string }> },
) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can change waitlist status",
  });
  if (result instanceof NextResponse) return result;
  const { supabase, user } = result;

  const { id: productId, participationId } = await params;

  const body = await parseJsonBody(request, waitlistTransitionBody);
  if (body instanceof NextResponse) return body;

  // IDOR guard: the participation must belong to THIS product (else a
  // participationId from another product could be transitioned via this URL).
  const { data: participation, error: fetchError } = await supabase
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

  // Block consumer_club — symmetric with the add/remove gate (defense in depth).
  const { data: product, error: productError } = await supabase
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
          "Waitlist promote/demote is not supported for consumer clubs (recurring billing).",
      },
      { status: 400 },
    );
  }

  // Dispatch to the matching RPC and validate its Json result shape before
  // responding (the db tests parse real RPC output through the same schemas).
  if (body.action === "promote") {
    const { data, error } = await supabase.rpc("promote_from_waitlist", {
      p_participation_id: participationId,
      p_group_id: body.groupId ?? undefined,
    });
    if (error) {
      const status = error.code === "P0002" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    promoteFromWaitlistRpcResult.parse(data);
  } else {
    const { data, error } = await supabase.rpc("demote_to_waitlist", {
      p_participation_id: participationId,
    });
    if (error) {
      const status = error.code === "P0002" ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    demoteToWaitlistRpcResult.parse(data);
  }

  // Audit trail — mirrors admin_add_gamer / admin_remove_gamer.
  console.info(
    JSON.stringify({
      event: "admin_waitlist_transition",
      action: body.action,
      admin_id: user.id,
      product_id: productId,
      participation_id: participationId,
      at: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ ok: true });
}
