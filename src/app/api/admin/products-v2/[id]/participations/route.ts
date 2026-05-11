import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/products-v2/[id]/participations
 *
 * Admin-only comp-enrollment path: drops a gamer directly into a product
 * with status='active', bypassing payment, seat caps, registration windows,
 * and effective-status gates. The customer_id is resolved from parent_gamer
 * (v1: one parent per gamer; multi-parent reckoning is future work).
 *
 * Blocked on consumer_club (recurring subscription/bundle billing makes a
 * no-payment comp awkward and we don't model it yet). Camps, events, and
 * municipality clubs are all in scope — camps + events are one-shot paid /
 * free, muni is invoiced off-platform via external_contract.
 *
 * Uses the admin (service-role) client for the write. participations_v2 only
 * grants SELECT to authenticated; per the original design (migration 00039),
 * writes go through SECURITY DEFINER RPCs or via the admin client. We
 * deliberately bypass create_participation_v2 here because its gates
 * (parent-of-customer, registration-opens-at, effective-status, seat-cap)
 * are exactly what the admin override should sail past.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await requireRole("admin", {
    forbiddenMessage: "Only admins can add gamers directly to a product",
  });
  if (result instanceof NextResponse) return result;
  const { user } = result;

  const { id: productId } = await params;

  let body: { gamerId?: unknown };
  try {
    body = (await request.json()) as { gamerId?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const gamerId = body.gamerId;
  if (typeof gamerId !== "string" || gamerId.length === 0) {
    return NextResponse.json(
      { error: "gamerId is required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Fetch product type. Consumer clubs are blocked here in addition to the
  // UI gate — defense in depth against direct route calls.
  const { data: product, error: productError } = await admin
    .from("products_v2")
    .select("id, product_type")
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
          "Admin add-gamer is not supported for consumer clubs (recurring billing). Have the parent purchase a subscription instead.",
      },
      { status: 400 },
    );
  }

  // Resolve the gamer's parent. v1 assumes a single parent per gamer; if a
  // gamer is somehow linked to multiple parents we pick the oldest link
  // deterministically. Multi-parent UX is tracked for future work.
  const { data: parentLinks, error: parentError } = await admin
    .from("parent_gamer")
    .select("parent_id, created_at")
    .eq("gamer_id", gamerId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (parentError) {
    return NextResponse.json({ error: parentError.message }, { status: 400 });
  }
  if (parentLinks.length === 0) {
    return NextResponse.json(
      { error: "Gamer has no linked parent — cannot enroll" },
      { status: 400 },
    );
  }
  const customerId = parentLinks[0].parent_id;

  // Direct insert via service-role. participations_v2 grants SELECT to
  // authenticated but not INSERT (migration 00039 routes writes through
  // SECURITY DEFINER RPCs or admin client by design).
  const { data: inserted, error: insertError } = await admin
    .from("participations_v2")
    .insert({
      product_id: productId,
      gamer_id: gamerId,
      customer_id: customerId,
      status: "active",
      credits_remaining: 0,
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505 = the partial unique index on (product_id, gamer_id) for
    // non-reserving statuses fired — the gamer is already enrolled (active,
    // waitlisted, or completed).
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "This gamer is already enrolled on the product" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  // Audit log line — there's no audit column on participations_v2 per the
  // product spec, but a server-side trail is necessary so we can answer
  // "which admin comped this gamer onto this product?" later. Hosted log
  // aggregation picks this up; no DB write.
  console.info(
    JSON.stringify({
      event: "admin_add_gamer_v2",
      admin_id: user.id,
      product_id: productId,
      gamer_id: gamerId,
      customer_id: customerId,
      participation_id: inserted.id,
      at: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ participation_id: inserted.id });
}
