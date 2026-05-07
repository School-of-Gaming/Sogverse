import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ProductGroupsV2Snapshot } from "@/types";

/**
 * Wire shape sent to POST /api/admin/products-v2/[id]/groups/apply.
 * Mirrors the commit_group_changes_v2 RPC parameters.
 *
 * tempIds in addedGroups serve two purposes:
 *  - the RPC returns a tempId → realUuid map so the client can resolve them
 *  - geduAssignmentsAdded.groupId and participationMoves.toGroupId can
 *    reference a tempId from this same batch (the RPC resolves them server-side)
 */
export interface BatchGroupChangesV2 {
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

export interface ApplyGroupChangesV2Result {
  tempMap: Record<string, string>;
}

export class GroupsV2Service {
  constructor(private supabase: SupabaseClient<Database>) {}

  /** Loads the full Groups panel snapshot for a v2 product (admin-only). */
  async getProductGroups(productId: string): Promise<ProductGroupsV2Snapshot> {
    const { data, error } = await this.supabase.rpc(
      "get_product_groups_v2_with_details",
      { p_product_id: productId },
    );
    if (error) throw error;
    // The RPC always returns a populated object — the JSONB type from
    // PostgREST is `Json`, so we narrow here.
    return data as unknown as ProductGroupsV2Snapshot;
  }

  /**
   * Applies a batch of staged group changes via the apply route, which calls
   * commit_group_changes_v2. Mutations always go through the API route, never
   * directly from the browser client — the route uses requireRole + the admin
   * client so we don't grant write privileges to authenticated.
   */
  async applyChanges(
    productId: string,
    batch: BatchGroupChangesV2,
  ): Promise<ApplyGroupChangesV2Result> {
    const response = await fetch(
      `/api/admin/products-v2/${productId}/groups/apply`,
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
    return (await response.json()) as ApplyGroupChangesV2Result;
  }
}
