import type {
  AppSupabaseClient,
  GeduAssignedProduct,
  MyAssignedProductRow,
  ProductTranslation,
  ProductType,
} from "@/types";

/**
 * Row shape consumed by the gedu dashboard's "My Groups" section. One
 * entry per `gedu_group_assignments` row for the signed-in gedu, with
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
     * Product kind. The dashboard card uses it to pick the right URL prefix
     * for "View details" — `/gedu/clubs/[id]`, `/gedu/camps/[id]`, or
     * `/gedu/events/[id]` — so the gedu lands on a route that matches their
     * mental model.
     */
    productType: ProductType;
    /**
     * Raw translation rows. Resolved at render time so a locale switch
     * doesn't refetch.
     */
    translations: Pick<ProductTranslation, "locale" | "name" | "description">[];
  };
  /** The gedu's own assigned group_id for this product. */
  groupId: string;
  /** Total number of groups in the product (every `product_groups` row). */
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
  constructor(private supabase: AppSupabaseClient) {}

  async getMyAssignedProducts(): Promise<MyAssignedProductSessionRow[]> {
    const { data, error } = await this.supabase.rpc("get_my_assigned_products");
    if (error) throw error;
    return (data as MyAssignedProductRow[]).map(toMyAssignedProductSessionRow);
  }

  /**
   * Fetches everything the gedu's session-details page needs in a single
   * round trip — product shell, every group's name/gamer count/gedu list,
   * and the full roster (with primary parent email) for the caller's own
   * group. Backed by the SECURITY DEFINER RPC `get_gedu_assigned_product`;
   * the RPC raises 42501 when the caller isn't a gedu or isn't assigned to
   * the product, which we surface as `null` so the route can render a clean
   * "not your session" empty state instead of throwing.
   */
  async getAssignedProductDetail(
    productId: string,
  ): Promise<GeduAssignedProduct | null> {
    const { data, error } = await this.supabase.rpc(
      "get_gedu_assigned_product",
      { p_product_id: productId },
    );

    if (error) {
      if (error.code === "42501") return null;
      throw error;
    }

    return data as unknown as GeduAssignedProduct;
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
      productType: row.product_type,
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
