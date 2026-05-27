import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MyAssignedProductRow, ProductTranslationV2 } from "@/types";

/**
 * Row shape consumed by the gedu dashboard's "My Groups" section. One
 * entry per `gedu_group_assignments_v2` row for the signed-in gedu, with
 * the product shell + product-wide aggregates (group count, gamer count
 * across every group). The cards on the dashboard talk about *groups* —
 * the gedu's mental model — but the underlying truth is one card per
 * assigned *product*, since `(gedu_id, product_id)` is unique. The TS
 * naming follows the data.
 */
export interface MyAssignedProductSessionRow {
  /** The product the gedu is assigned to. */
  product: {
    id: string;
    timezone: string;
    /**
     * Inclusive start date in product-local calendar (YYYY-MM-DD), or
     * null for ongoing clubs. Matches the participations shape so the
     * shared upcoming-session expansion (`expandUpcomingSessions`) can
     * clamp pre-start phantom occurrences out of the list.
     */
    startDate: string | null;
    /** Inclusive end date (YYYY-MM-DD), null for ongoing clubs. */
    endDate: string | null;
    /** External Padlet URL, null when unset. */
    padletUrl: string | null;
    /** False for in-person products — the join button is a no-op in that case. */
    isRemote: boolean;
    /**
     * Raw translation rows. Resolved at render time so a locale switch
     * doesn't refetch.
     */
    translations: Pick<ProductTranslationV2, "locale" | "name" | "description">[];
  };
  /** The gedu's own assigned group_id for this product. */
  groupId: string;
  /** Total number of groups in the product (every `product_groups_v2` row). */
  groupCount: number;
  /** Active participations summed across every group in the product. */
  gamerCount: number;
  slots: Array<{
    weekday: number;
    startTime: string;
    durationMinutes: number;
  }>;
}

/**
 * Reads the gedu's product assignments for the dashboard. Calls the
 * `get_my_assigned_products` RPC (SECURITY DEFINER, gedu-only); the
 * function bakes its own authorization, so the user-bound client is
 * enough — no admin client required.
 */
export class AssignmentsService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getMyAssignedProducts(): Promise<MyAssignedProductSessionRow[]> {
    const { data, error } = await this.supabase.rpc("get_my_assigned_products");
    if (error) throw error;
    return (data as MyAssignedProductRow[]).map(toMyAssignedProductSessionRow);
  }
}

function toMyAssignedProductSessionRow(
  row: MyAssignedProductRow,
): MyAssignedProductSessionRow {
  return {
    product: {
      id: row.product_id,
      timezone: row.timezone,
      startDate: row.start_date,
      endDate: row.end_date,
      padletUrl: row.padlet_url,
      isRemote: row.is_remote,
      translations: row.product_translations,
    },
    groupId: row.group_id,
    groupCount: row.group_count,
    gamerCount: row.gamer_count,
    slots: row.schedule_slots.map((s) => ({
      weekday: s.weekday,
      startTime: s.start_time,
      durationMinutes: s.duration_minutes,
    })),
  };
}
