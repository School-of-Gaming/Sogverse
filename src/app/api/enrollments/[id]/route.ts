import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRefundEligibility } from "@/lib/enrollment";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireRole("customer", {
      forbiddenMessage: "Only customers can unenroll gamers",
    });
    if (result instanceof NextResponse) return result;
    const { user } = result;

    const { id: enrollmentId } = await params;

    if (!enrollmentId) {
      return NextResponse.json({ error: "Enrollment ID is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Look up enrollment → product info for refund calculation
    const { data: enrollment, error: enrollmentError } = await admin
      .from("group_enrollments")
      .select(`
        id,
        enrolled_by,
        status,
        product_groups(
          products(token_cost, day_of_week, start_time, timezone)
        )
      `)
      .eq("id", enrollmentId)
      .single();

    if (enrollmentError || !enrollment) {
      return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
    }

    if (enrollment.enrolled_by !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (enrollment.status !== "active") {
      return NextResponse.json({ error: "Enrollment is not active" }, { status: 400 });
    }

    const product = (enrollment.product_groups as { products: {
      token_cost: number;
      day_of_week: number;
      start_time: string;
      timezone: string;
    } }).products;

    // Determine refund eligibility
    const { eligible, refundAmount } = getRefundEligibility(product);

    const { data, error } = await admin.rpc("unenroll_gamer", {
      p_customer_id: user.id,
      p_enrollment_id: enrollmentId,
      p_refund_amount: refundAmount,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rpcResult = data?.[0];
    return NextResponse.json({
      refunded: eligible,
      refundAmount,
      newBalance: rpcResult?.new_balance,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
