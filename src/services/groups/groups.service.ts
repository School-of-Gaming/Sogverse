import type { AppSupabaseClient, ProductGroupsSnapshot } from "@/types";

/**
 * Wire shape sent to POST /api/admin/products/[id]/groups/apply.
 * Mirrors the commit_group_changes RPC parameters.
 *
 * tempIds in addedGroups serve two purposes:
 *  - the RPC returns a tempId → realUuid map so the client can resolve them
 *  - geduAssignmentsAdded.groupId and participationMoves.toGroupId can
 *    reference a tempId from this same batch (the RPC resolves them server-side)
 */
export interface BatchGroupChanges {
  addedGroups: Array<{
    tempId: string;
    name: string;
    geduIds: string[];
  }>;
  renamedGroups: Array<{ groupId: string; name: string }>;
  deletedGroupIds: string[];
  geduAssignmentsAdded: Array<{ groupId: string; geduId: string }>;
  geduAssignmentsRemoved: Array<{ groupId: string; geduId: string }>;
  participationMoves: Array<{
    participationId: string;
    /** null = unassign (back to inbox); a tempId resolves via the new-group map */
    toGroupId: string | null;
  }>;
}

export interface ApplyGroupChangesResult {
  tempMap: Record<string, string>;
}

export class GroupsService {
  constructor(private supabase: AppSupabaseClient) {}

  /** Loads the full Groups panel snapshot for a product (admin-only). */
  async getProductGroups(productId: string): Promise<ProductGroupsSnapshot> {
    const { data, error } = await this.supabase.rpc(
      "get_product_groups_with_details",
      { p_product_id: productId },
    );
    if (error) throw error;
    // The RPC always returns a populated object — the JSONB type from
    // PostgREST is `Json`, so we narrow here.
    return data as unknown as ProductGroupsSnapshot;
  }

  /**
   * Applies a batch of staged group changes via the apply route, which calls
   * commit_group_changes. Mutations always go through the API route, never
   * directly from the browser client — `commit_group_changes` is
   * SECURITY DEFINER and re-checks `get_user_role() = 'admin'` itself, so the
   * route uses the user-context client from `requireRole` (no admin client
   * needed today).
   *
   * If/when the apply route grows email or Daily.co provisioning around the
   * RPC (mirroring the legacy provisioning logic), the route will need
   * `createAdminClient()` to read product/profile rows and provision rooms.
   * The RPC call itself doesn't change.
   */
  async applyChanges(
    productId: string,
    batch: BatchGroupChanges,
  ): Promise<ApplyGroupChangesResult> {
    const response = await fetch(
      `/api/admin/products/${productId}/groups/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(body.error ?? `Failed to apply changes (${response.status})`);
    }
    return (await response.json()) as ApplyGroupChangesResult;
  }

  /**
   * Admin comp-enrollment: drops a gamer directly into the product as an
   * active participation, bypassing payment, seat caps, registration windows,
   * and the effective-status gate. Blocked server-side on consumer_club —
   * recurring billing makes a no-payment comp awkward and we don't model it.
   *
   * On success the caller should invalidate `groupsKeys.byProduct(productId)`
   * so the new chip appears in the Unassigned card.
   */
  async addGamerToProduct(
    productId: string,
    gamerId: string,
  ): Promise<{ participation_id: string }> {
    const response = await fetch(
      `/api/admin/products/${productId}/participations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gamerId }),
      },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(
        body.error ?? `Failed to add gamer (${response.status})`,
      );
    }
    return (await response.json()) as { participation_id: string };
  }
}
