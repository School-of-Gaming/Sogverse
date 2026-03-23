import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types";

export interface EnrollmentGroup {
  groupId: string;
  geduDisplayName: string;
  gamerCount: number;
  minGamerAge: number | null;
  maxGamerAge: number | null;
}

export class EnrollmentsService {
  constructor(private supabase: SupabaseClient<Database>) {}

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

  async getEnrollmentGroups(productId: string): Promise<EnrollmentGroup[]> {
    const { data, error } = await this.supabase.rpc("get_enrollment_groups", {
      p_product_id: productId,
    });

    if (error) throw error;

    return data.map((row) => ({
      groupId: row.group_id,
      geduDisplayName: row.gedu_display_name,
      gamerCount: row.gamer_count,
      // Generated types mark these as non-null, but MIN/MAX over a LEFT JOIN
      // returns null for groups with zero enrollments.
      minGamerAge: row.min_gamer_age as number | null,
      maxGamerAge: row.max_gamer_age as number | null,
    }));
  }
}
