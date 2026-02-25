// Using generic type to avoid version-specific Supabase type incompatibilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

export interface CustomerEnrollment {
  enrollmentId: string;
  groupId: string;
  gamerId: string;
  gamerDisplayName: string;
  status: string;
  enrolledAt: string;
  lastChargedAt: string | null;
  unenrolledAt: string | null;
  productId: string;
  productName: string;
  productImageUrl: string;
  productTokenCost: number;
  productDayOfWeek: number;
  productStartTime: string;
  productTimezone: string;
  productDurationMinutes: number;
  geduDisplayName: string;
}

export interface EnrollmentGroup {
  groupId: string;
  geduDisplayName: string;
  gamerCount: number;
  minGamerAge: number | null;
  maxGamerAge: number | null;
}

export class EnrollmentsService {
  constructor(private supabase: SupabaseClientType) {}

  async enrollGamer(
    gamerId: string,
    groupId: string,
  ): Promise<{ enrollmentId: string; newBalance: number }> {
    const response = await fetch("/api/enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gamerId, groupId }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to enroll gamer");
    }

    return response.json();
  }

  async unenrollGamer(
    enrollmentId: string,
  ): Promise<{ refunded: boolean; refundAmount: number; newBalance: number }> {
    const response = await fetch(`/api/enrollments/${enrollmentId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to unenroll gamer");
    }

    return response.json();
  }

  async getMyEnrollments(): Promise<CustomerEnrollment[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    if (!user) throw new Error("Not authenticated");

    const { data, error } = await this.supabase.rpc("get_customer_enrollments", {
      p_customer_id: user.id,
    });

    if (error) throw error;

    return (data || []).map((row: Record<string, unknown>) => ({
      enrollmentId: row.enrollment_id,
      groupId: row.group_id,
      gamerId: row.gamer_id,
      gamerDisplayName: row.gamer_display_name,
      status: row.status,
      enrolledAt: row.enrolled_at,
      lastChargedAt: row.last_charged_at,
      unenrolledAt: row.unenrolled_at,
      productId: row.product_id,
      productName: row.product_name,
      productImageUrl: row.product_image_url,
      productTokenCost: row.product_token_cost,
      productDayOfWeek: row.product_day_of_week,
      productStartTime: row.product_start_time,
      productTimezone: row.product_timezone,
      productDurationMinutes: row.product_duration_minutes,
      geduDisplayName: row.gedu_display_name,
    }));
  }

  async getEnrollmentGroups(productId: string): Promise<EnrollmentGroup[]> {
    const { data, error } = await this.supabase.rpc("get_enrollment_groups", {
      p_product_id: productId,
    });

    if (error) throw error;

    return (data || []).map((row: Record<string, unknown>) => ({
      groupId: row.group_id as string,
      geduDisplayName: row.gedu_display_name as string,
      gamerCount: row.gamer_count as number,
      minGamerAge: row.min_gamer_age as number | null,
      maxGamerAge: row.max_gamer_age as number | null,
    }));
  }
}
