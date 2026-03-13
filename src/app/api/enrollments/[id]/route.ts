import { NextResponse, after } from "next/server";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRefundEligibility } from "@/lib/enrollment";
import { ENROLLMENT_CHARGE_WINDOW_HOURS } from "@/lib/constants/enrollment";
import { sendUnenrollmentNotifications } from "@/lib/enrollment-notifications";

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
        gamer_id,
        group_id,
        enrolled_by,
        status,
        product_groups(
          products(token_cost, day_of_week, start_time, timezone)
        )
      `)
      .eq("id", enrollmentId)
      .single();

    if (enrollmentError) {
      return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
    }

    if (enrollment.enrolled_by !== user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (enrollment.status !== "active") {
      return NextResponse.json({ error: "Enrollment is not active" }, { status: 400 });
    }

    const product = enrollment.product_groups.products;

    // Look up the latest charge to determine if the session has already been attended
    const { data: latestCharge } = await admin
      .from("enrollment_charges")
      .select("session_date")
      .eq("enrollment_id", enrollmentId)
      .order("session_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Determine refund eligibility
    const now = new Date();
    const { eligible, refundAmount } = getRefundEligibility(
      product,
      ENROLLMENT_CHARGE_WINDOW_HOURS,
      now,
      latestCharge?.session_date ?? null,
    );

    const { data, error } = await admin.rpc("unenroll_gamer", {
      p_customer_id: user.id,
      p_enrollment_id: enrollmentId,
      p_refund: eligible,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const rpcResult = data[0];

    after(async () => {
      try {
        await sendUnenrollmentNotifications({
          customerId: user.id,
          gamerId: enrollment.gamer_id,
          groupId: enrollment.group_id,
        });
      } catch (err) {
        console.error("Unenrollment notification error:", err);
      }
    });

    return NextResponse.json({
      refunded: eligible,
      refundAmount,
      newBalance: rpcResult.new_balance,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
