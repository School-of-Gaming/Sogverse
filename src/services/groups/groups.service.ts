import type { AppSupabaseClient, ProductGroupsSnapshot } from "@/types";
import {
  parseJsonResponse,
  readErrorMessage,
} from "@/lib/api/json-response";
import {
  addParticipationResponse,
  applyGroupChangesResult,
  productGroupsSnapshot,
  type ApplyGroupChangesResult,
  type GroupChangeSet,
} from "./groups.contracts";

/**
 * `GroupChangeSet` — a set of group-structure changes applied atomically by
 * `apply_group_changes`. One change or many — single-change calls are the
 * common case (the admin panel auto-saves each action), and the panel never
 * batches anymore. The set shape is retained because the RPC applies its parts
 * in a fixed order within one transaction, which is what makes destructive
 * actions (delete-group cascading gamers back to unassigned) safe.
 *
 * tempIds in addedGroups serve two purposes:
 *  - the RPC returns a tempId → realUuid map so the client can resolve them
 *  - geduAssignmentsAdded.groupId and participationMoves.toGroupId can reference
 *    a tempId from the same set (the RPC resolves them server-side)
 *
 * Prefer the intent-named methods below (createGroup, renameGroup, …) over
 * hand-building this shape at call sites — they keep callers expressing intent
 * while this generality stays an implementation detail of `applyChanges`.
 *
 * The schema itself lives in groups.contracts.ts, shared with the apply route.
 */
export type { ApplyGroupChangesResult, GroupChangeSet };

/** An empty change set — spread it and override the one field a method touches. */
function emptyChangeSet(): GroupChangeSet {
  return {
    addedGroups: [],
    renamedGroups: [],
    deletedGroupIds: [],
    geduAssignmentsAdded: [],
    geduAssignmentsRemoved: [],
    participationMoves: [],
  };
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
    // The RPC returns `Json`; the contract schema is the structure.
    return productGroupsSnapshot.parse(data);
  }

  /**
   * The ids of a product's waitlisted participations that carry a payment
   * marker — a recorded Stripe Checkout Session, i.e. money once arrived for
   * that seat. The Groups panel's promote refusal reads it: on a paid product,
   * a waitlister with no marker never paid and cannot simply be seated, while a
   * member who paid and was later demoted keeps their marker and promotes
   * plainly (demotion doesn't clear it).
   *
   * A separate read rather than a field on the groups snapshot: the snapshot
   * RPC does not carry the marker, and only a paid product's waitlist asks the
   * question. Small and indexed — the waitlist of one product, ids only.
   */
  async getWaitlistPaymentMarkers(productId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("participations")
      .select("id")
      .eq("product_id", productId)
      .eq("status", "waitlisted")
      .not("stripe_checkout_session_id", "is", null);
    if (error) throw error;
    return data.map((row) => row.id);
  }

  /**
   * Applies a change set via the apply route, which calls the
   * `apply_group_changes` RPC. Mutations always go through the API route, never
   * directly from the browser client — `apply_group_changes` is SECURITY DEFINER
   * and re-checks `get_user_role() = 'admin'` itself, so the route uses the
   * user-context client from `requireRole` (no admin client needed today).
   *
   * Callers should prefer the intent-named methods below; this is the shared
   * mechanism they all delegate to.
   */
  async applyChanges(
    productId: string,
    changes: GroupChangeSet,
  ): Promise<ApplyGroupChangesResult> {
    const response = await fetch(
      `/api/admin/products/${productId}/groups/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      },
    );
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(
          response,
          `Failed to apply changes (${response.status})`,
        ),
      );
    }
    return parseJsonResponse(response, applyGroupChangesResult);
  }

  /**
   * Creates a group (optionally pre-assigning Gedus) and returns its real id.
   * The RPC resolves the throwaway tempId to a real UUID and hands it back in
   * `tempMap`; we surface just that id so the caller can swap its optimistic
   * placeholder for the persisted row.
   */
  async createGroup(
    productId: string,
    name: string,
    geduIds: string[] = [],
  ): Promise<string> {
    const tempId = `temp-${crypto.randomUUID()}`;
    const { tempMap } = await this.applyChanges(productId, {
      ...emptyChangeSet(),
      addedGroups: [{ tempId, name, geduIds }],
    });
    return tempMap[tempId];
  }

  /** Renames an existing group. */
  async renameGroup(
    productId: string,
    groupId: string,
    name: string,
  ): Promise<void> {
    await this.applyChanges(productId, {
      ...emptyChangeSet(),
      renamedGroups: [{ groupId, name }],
    });
  }

  /**
   * Deletes a group. The RPC's transaction cascades gamers in the group back to
   * unassigned (participations.group_id → NULL) and drops the group's Gedu
   * assignments — which is why this goes through the atomic change set rather
   * than a bare DELETE.
   */
  async deleteGroup(productId: string, groupId: string): Promise<void> {
    await this.applyChanges(productId, {
      ...emptyChangeSet(),
      deletedGroupIds: [groupId],
    });
  }

  /**
   * Moves a participation into a group, or to the unassigned inbox when
   * `toGroupId` is null.
   */
  async moveParticipation(
    productId: string,
    participationId: string,
    toGroupId: string | null,
  ): Promise<void> {
    await this.applyChanges(productId, {
      ...emptyChangeSet(),
      participationMoves: [{ participationId, toGroupId }],
    });
  }

  /** Assigns a Gedu to a group. */
  async addGedu(
    productId: string,
    groupId: string,
    geduId: string,
  ): Promise<void> {
    await this.applyChanges(productId, {
      ...emptyChangeSet(),
      geduAssignmentsAdded: [{ groupId, geduId }],
    });
  }

  /** Unassigns a Gedu from a group. */
  async removeGedu(
    productId: string,
    groupId: string,
    geduId: string,
  ): Promise<void> {
    await this.applyChanges(productId, {
      ...emptyChangeSet(),
      geduAssignmentsRemoved: [{ groupId, geduId }],
    });
  }

  /**
   * Admin comp-enrollment: drops a gamer directly into the product as an
   * active participation, bypassing payment, seat caps, registration windows,
   * and the effective-status gate. Blocked server-side on consumer_club —
   * recurring billing makes a no-payment comp awkward and we don't model it.
   *
   * This deliberately does NOT go through `apply_group_changes`: creating a
   * participation is an enrollment-lifecycle action (its domain siblings are
   * create_participation / cancel_participation), distinct from mutating group
   * structure. On success the caller should invalidate
   * `groupsKeys.byProduct(productId)` so the new chip appears in Unassigned.
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
      throw new Error(
        await readErrorMessage(
          response,
          `Failed to add gamer (${response.status})`,
        ),
      );
    }
    return parseJsonResponse(response, addParticipationResponse);
  }

  /**
   * Promotes a waitlisted gamer to an active seat, placing them in `toGroupId`
   * (null = unassigned inbox). Calls the PATCH waitlist-transition route, which
   * runs promote_from_waitlist — no seat-count gate, a deliberate admin override
   * (see the route). On success the caller should invalidate
   * groupsKeys.byProduct(productId) so the chip moves from the waitlist into its
   * new home and the seat-count bar updates.
   */
  async promoteFromWaitlist(
    productId: string,
    participationId: string,
    toGroupId: string | null,
  ): Promise<void> {
    const response = await fetch(
      `/api/admin/products/${productId}/participations/${participationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote", groupId: toGroupId }),
      },
    );
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(
          response,
          `Failed to promote gamer (${response.status})`,
        ),
      );
    }
  }

  /**
   * Demotes an active gamer to the BACK of the waitlist (status→waitlisted,
   * group cleared). Calls the PATCH waitlist-transition route, which runs
   * demote_to_waitlist. On success the caller should invalidate
   * groupsKeys.byProduct(productId).
   */
  async demoteToWaitlist(
    productId: string,
    participationId: string,
  ): Promise<void> {
    const response = await fetch(
      `/api/admin/products/${productId}/participations/${participationId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "demote" }),
      },
    );
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(
          response,
          `Failed to move gamer to waitlist (${response.status})`,
        ),
      );
    }
  }

  /**
   * Admin un-enrollment: hard-deletes a participation — the inverse of
   * addGamerToProduct. Hits the DELETE participations route, which calls
   * cancel_participation(reason='admin_cancelled'). No refund is issued (see
   * the route). Blocked server-side on consumer_club, same as the add path. On
   * success the caller should invalidate groupsKeys.byProduct(productId) so the
   * chip leaves the panel.
   */
  async removeGamerFromProduct(
    productId: string,
    participationId: string,
  ): Promise<void> {
    const response = await fetch(
      `/api/admin/products/${productId}/participations/${participationId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(
          response,
          `Failed to remove gamer (${response.status})`,
        ),
      );
    }
  }
}
