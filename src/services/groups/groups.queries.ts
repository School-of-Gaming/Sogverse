"use client";

import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { GroupsService } from "./groups.service";
import type {
  GroupGeduDetail,
  ProductGroupsSnapshot,
  ProductGroupWithDetails,
} from "@/types";

export const groupsKeys = {
  all: ["groups"] as const,
  byProduct: (productId: string) =>
    [...groupsKeys.all, "product", productId] as const,
  /**
   * Nested under the product's key on purpose: every mutation below invalidates
   * `byProduct`, and prefix matching carries that down here — so the markers
   * refresh alongside the snapshot they're read next to, with nothing extra to
   * remember at each mutation.
   */
  waitlistPayments: (productId: string) =>
    [...groupsKeys.byProduct(productId), "waitlist-payments"] as const,
};

export function useProductGroups(productId: string) {
  const supabase = getClient();
  const service = new GroupsService(supabase);

  return useQuery({
    queryKey: groupsKeys.byProduct(productId),
    queryFn: () => service.getProductGroups(productId),
    enabled: !!productId,
  });
}

/**
 * Which of the product's waitlisted participations were paid for (see the
 * service method for what the marker is and why it decides a promotion).
 *
 * `enabled` is the caller's: only a paid product with a waitlist has a refusal
 * to decide, so nothing else pays for the read. While it is disabled or still
 * in flight the data is undefined, and the panel treats that as "no marker" —
 * the refusal errs toward its dialog rather than toward a free seat.
 */
export function useWaitlistPaymentMarkers(productId: string, enabled: boolean) {
  const service = new GroupsService(getClient());

  return useQuery({
    queryKey: groupsKeys.waitlistPayments(productId),
    queryFn: () => service.getWaitlistPaymentMarkers(productId),
    enabled: !!productId && enabled,
  });
}

// ─── Per-action auto-save ──────────────────────────────────────────────────
//
// Each panel action persists immediately. The shared shape:
//  - onMutate optimistically patches the cached snapshot for *transform*
//    actions (move/rename/addGedu/create) so the new state shows at once, and
//    snapshots the previous cache for rollback.
//  - onError rolls back (the snap-back is the only error signal — no toast).
//  - onSettled invalidates so the panel reconciles with server truth, which is
//    also how a second admin's concurrent edits land (last-write-wins).
//
// Destructive actions (delete group, remove Gedu) are NOT optimistically
// removed: the element stays visible but greyed/disabled while saving (see the
// pending registry below), then disappears on the settle refetch. That matches
// the "greyed while saving, gone once the DB confirms" model.

/** Distinct namespace so mutation keys don't collide with the query key. */
const groupMutationBase = (productId: string) =>
  [...groupsKeys.byProduct(productId), "mutation"] as const;

// Display order is owned by the server: get_product_groups_with_details orders
// participations by updated_at and group Gedus by their assignment time, so the
// most-recently-touched row is last. A move bumps updated_at (DB trigger) and a
// new Gedu gets a fresh assignment row — exactly where the optimistic patches
// below append the row. So the optimistic order and the settle-refetch order
// agree by construction: the client just renders the array it's given and
// appends on a move, with no client-side re-sort and no comparing browser vs
// server clocks (that mismatch was the source of the chip-reorder flicker).

type Participation = ProductGroupsSnapshot["unassigned"][number];

// ─── Optimistic cache patches (pure) ─────────────────────────────────────────

/** Where a dragged participation lands: a group, the unassigned inbox, or the waitlist. */
type Placement =
  | { area: "group"; groupId: string }
  | { area: "unassigned" }
  | { area: "waitlist" };

/** A group/unassigned drop target keyed by `toGroupId` (null = unassigned inbox). */
function groupPlacement(toGroupId: string | null): Placement {
  return toGroupId === null
    ? { area: "unassigned" }
    : { area: "group", groupId: toGroupId };
}

/**
 * The one optimistic cache patch behind every participation drag — move,
 * promote, and demote are all the same operation: pull the chip out of wherever
 * it currently sits (group, unassigned, or waitlist — taking from all three is
 * safe since it's only ever in one), optionally re-stamp its status (promote →
 * active, demote → waitlisted), and append it to the destination.
 *
 * Append-to-end is load-bearing: the server orders each list by a key the
 * mutation bumps to "now" (updated_at for the active lists, waitlisted_at for
 * the waitlist), so the row lands last on refetch too — optimistic and settle
 * agree and nothing reorders. Returns the snapshot untouched if id isn't found.
 */
function withParticipationRelocated(
  snapshot: ProductGroupsSnapshot,
  participationId: string,
  to: Placement,
  status?: Participation["status"],
): ProductGroupsSnapshot {
  let moved: Participation | undefined;
  const take = (list: Participation[]): Participation[] =>
    list.filter((p) => {
      if (p.id === participationId) {
        moved = p;
        return false;
      }
      return true;
    });

  const stripped: ProductGroupsSnapshot = {
    ...snapshot,
    groups: snapshot.groups.map((g) => ({
      ...g,
      participations: take(g.participations),
    })),
    unassigned: take(snapshot.unassigned),
    waitlist: take(snapshot.waitlist),
  };

  if (!moved) return snapshot;
  const landed: Participation = status ? { ...moved, status } : moved;

  switch (to.area) {
    case "unassigned":
      return { ...stripped, unassigned: [...stripped.unassigned, landed] };
    case "waitlist":
      return { ...stripped, waitlist: [...stripped.waitlist, landed] };
    case "group":
      return {
        ...stripped,
        groups: stripped.groups.map((g) =>
          g.id === to.groupId
            ? { ...g, participations: [...g.participations, landed] }
            : g,
        ),
      };
  }
}

function withGroupRenamed(
  snapshot: ProductGroupsSnapshot,
  groupId: string,
  name: string,
): ProductGroupsSnapshot {
  return {
    ...snapshot,
    groups: snapshot.groups.map((g) =>
      g.id === groupId ? { ...g, name } : g,
    ),
  };
}

function withGeduAdded(
  snapshot: ProductGroupsSnapshot,
  groupId: string,
  gedu: GroupGeduDetail,
): ProductGroupsSnapshot {
  return {
    ...snapshot,
    groups: snapshot.groups.map((g) => {
      if (g.id !== groupId) return g;
      if (g.gedus.some((existing) => existing.id === gedu.id)) return g;
      return { ...g, gedus: [...g.gedus, gedu] };
    }),
  };
}

function withGroupAdded(
  snapshot: ProductGroupsSnapshot,
  group: ProductGroupWithDetails,
): ProductGroupsSnapshot {
  return { ...snapshot, groups: [...snapshot.groups, group] };
}

// ─── Mutation hooks ──────────────────────────────────────────────────────────

interface MoveVars {
  participationId: string;
  toGroupId: string | null;
}

export function useMoveParticipation(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  return useMutation({
    mutationKey: [...groupMutationBase(productId), "move"],
    mutationFn: ({ participationId, toGroupId }: MoveVars) =>
      service.moveParticipation(productId, participationId, toGroupId),
    onMutate: async ({ participationId, toGroupId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProductGroupsSnapshot>(key);
      if (previous) {
        queryClient.setQueryData(
          key,
          withParticipationRelocated(
            previous,
            participationId,
            groupPlacement(toGroupId),
          ),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

interface RenameVars {
  groupId: string;
  name: string;
}

export function useRenameGroup(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  return useMutation({
    mutationKey: [...groupMutationBase(productId), "rename"],
    mutationFn: ({ groupId, name }: RenameVars) =>
      service.renameGroup(productId, groupId, name),
    onMutate: async ({ groupId, name }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProductGroupsSnapshot>(key);
      if (previous) {
        queryClient.setQueryData(key, withGroupRenamed(previous, groupId, name));
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

interface CreateVars {
  name: string;
}

export function useCreateGroup(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  return useMutation({
    mutationKey: [...groupMutationBase(productId), "create"],
    mutationFn: ({ name }: CreateVars) => service.createGroup(productId, name),
    onMutate: async ({ name }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProductGroupsSnapshot>(key);
      if (previous) {
        // The temp id is throwaway — the settle refetch replaces this card with
        // the persisted row (real id, server-assigned created_at).
        const optimistic: ProductGroupWithDetails = {
          id: `temp-${crypto.randomUUID()}`,
          name,
          created_at: new Date().toISOString(),
          gedus: [],
          participations: [],
        };
        queryClient.setQueryData(key, withGroupAdded(previous, optimistic));
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

interface AddGeduVars {
  groupId: string;
  geduId: string;
  firstName: string;
  email: string | null;
}

export function useAddGedu(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  return useMutation({
    mutationKey: [...groupMutationBase(productId), "addGedu"],
    mutationFn: ({ groupId, geduId }: AddGeduVars) =>
      service.addGedu(productId, groupId, geduId),
    onMutate: async ({ groupId, geduId, firstName, email }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProductGroupsSnapshot>(key);
      if (previous) {
        queryClient.setQueryData(
          key,
          withGeduAdded(previous, groupId, {
            id: geduId,
            first_name: firstName,
            email,
          }),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

// ─── Destructive-action mutation config (shared) ─────────────────────────────
//
// Delete-group, remove-Gedu and remove-gamer share a shape: no optimistic
// removal — the element greys via the pending registry while saving, then the
// settle refetch drops it. The subtle, easy-to-regress part is WHERE the
// invalidation lives. We await it INSIDE mutationFn (not in onSettled) so the
// mutation stays `pending` — and the element stays greyed — until the snapshot
// without it has actually landed. Invalidating in onSettled flips status to
// success the moment the write resolves, un-greying the element for the frame
// or two before the refetch removes it (a visible grey → ungrey → gone
// flicker). This reasoning lives here once so all three can't drift apart.
function destructiveSettle<TVars>(
  queryClient: QueryClient,
  key: QueryKey,
  run: (vars: TVars) => Promise<void>,
) {
  return {
    mutationFn: async (vars: TVars) => {
      await run(vars);
      await queryClient.invalidateQueries({ queryKey: key });
    },
    // Removal failed — the element is still in the snapshot. Reconcile with
    // server truth; it un-greys as the mutation leaves pending.
    onError: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  };
}

interface RemoveGeduVars {
  groupId: string;
  geduId: string;
}

export function useRemoveGedu(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  return useMutation({
    mutationKey: [...groupMutationBase(productId), "removeGedu"],
    ...destructiveSettle(queryClient, key, ({ groupId, geduId }: RemoveGeduVars) =>
      service.removeGedu(productId, groupId, geduId),
    ),
  });
}

interface DeleteVars {
  groupId: string;
}

export function useDeleteGroup(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  return useMutation({
    mutationKey: [...groupMutationBase(productId), "delete"],
    ...destructiveSettle(queryClient, key, ({ groupId }: DeleteVars) =>
      service.deleteGroup(productId, groupId),
    ),
  });
}

/**
 * Admin comp-enrollment mutation — drops a gamer directly into a product
 * (status='active', group_id=NULL). Invalidates the product's groups snapshot
 * so the new chip appears in the Unassigned card. Kept as a plain mutation: it
 * doesn't go through apply_group_changes (enrollment lifecycle, not group
 * structure) and the picker lacks the full participation row to optimistically
 * insert, so it just refetches on success.
 */
export function useAdminAddGamerToProduct(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());

  return useMutation({
    mutationFn: (gamerId: string) =>
      service.addGamerToProduct(productId, gamerId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: groupsKeys.byProduct(productId),
      });
    },
  });
}

/**
 * Admin un-enrollment mutation — hard-deletes a participation (inverse of
 * useAdminAddGamerToProduct). Destructive, so no optimistic removal: the chip
 * greys via the pending registry (`removes`) while in flight and disappears on
 * the settle refetch, matching the delete-group / remove-Gedu model (shared
 * `destructiveSettle` config, which also documents the flicker it avoids).
 * Keyed into groupMutationBase so the pending registry can surface it.
 */
export function useAdminRemoveGamerFromProduct(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  return useMutation({
    mutationKey: [...groupMutationBase(productId), "removeGamer"],
    ...destructiveSettle(
      queryClient,
      key,
      ({ participationId }: { participationId: string }) =>
        service.removeGamerFromProduct(productId, participationId),
    ),
  });
}

/**
 * Promote a waitlisted gamer into a group/unassigned (status→active). Uses the
 * same optimistic-then-settle shape as useMoveParticipation — the chip lands in
 * its destination immediately (append-to-end, matching the server's updated_at
 * order) so there's no grey-then-jump and no reconcile flicker as it crosses the
 * waitlist boundary. Rolls back on error; settle refetch is the source of truth.
 */
export function usePromoteFromWaitlist(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  return useMutation({
    mutationKey: [...groupMutationBase(productId), "promote"],
    mutationFn: ({
      participationId,
      toGroupId,
    }: {
      participationId: string;
      toGroupId: string | null;
    }) => service.promoteFromWaitlist(productId, participationId, toGroupId),
    onMutate: async ({ participationId, toGroupId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProductGroupsSnapshot>(key);
      if (previous) {
        queryClient.setQueryData(
          key,
          withParticipationRelocated(
            previous,
            participationId,
            groupPlacement(toGroupId),
            "active",
          ),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Demote an active gamer to the back of the waitlist (status→waitlisted). Same
 * optimistic-then-settle shape as promote: the chip moves to the end of the
 * waitlist immediately (matching the server's waitlisted_at = now() order), so
 * crossing the boundary doesn't flicker.
 */
export function useDemoteToWaitlist(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  return useMutation({
    mutationKey: [...groupMutationBase(productId), "demote"],
    mutationFn: ({ participationId }: { participationId: string }) =>
      service.demoteToWaitlist(productId, participationId),
    onMutate: async ({ participationId }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ProductGroupsSnapshot>(key);
      if (previous) {
        queryClient.setQueryData(
          key,
          withParticipationRelocated(
            previous,
            participationId,
            { area: "waitlist" },
            "waitlisted",
          ),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

// ─── Pending registry ────────────────────────────────────────────────────────
//
// Derives which elements have an in-flight mutation from React Query's mutation
// state, keyed by entity id (concurrency-safe — independent actions grey out
// independently). Components grey/disable off this rather than a single
// mutation's `isPending`.

interface PendingVars {
  participationId?: string;
  groupId?: string;
  geduId?: string;
}

/**
 * Narrow a mutation's `unknown` variables to the id fields the pending
 * registry reads. Field-by-field checks instead of an assertion: variables
 * that don't carry an id (or aren't an object at all) simply contribute
 * nothing, matching how the registry already treats absent ids.
 */
function toPendingVars(variables: unknown): PendingVars | undefined {
  if (typeof variables !== "object" || variables === null) return undefined;
  const vars: PendingVars = {};
  if (
    "participationId" in variables &&
    typeof variables.participationId === "string"
  ) {
    vars.participationId = variables.participationId;
  }
  if ("groupId" in variables && typeof variables.groupId === "string") {
    vars.groupId = variables.groupId;
  }
  if ("geduId" in variables && typeof variables.geduId === "string") {
    vars.geduId = variables.geduId;
  }
  return vars;
}

export interface GroupPending {
  /** participation ids with an in-flight move */
  moves: Set<string>;
  /** participation ids with an in-flight admin removal */
  removes: Set<string>;
  /** group ids with an in-flight rename */
  renames: Set<string>;
  /** group ids with an in-flight delete */
  deletes: Set<string>;
  /** `${groupId}:${geduId}` for an in-flight add/remove Gedu */
  gedus: Set<string>;
  /** a group create is in flight */
  creating: boolean;
}

export function useGroupPending(productId: string): GroupPending {
  const entries = useMutationState({
    filters: { mutationKey: groupMutationBase(productId), status: "pending" },
    select: (mutation) => {
      const action = mutation.options.mutationKey?.at(-1);
      return {
        action: typeof action === "string" ? action : undefined,
        vars: toPendingVars(mutation.state.variables),
      };
    },
  });

  const moves = new Set<string>();
  const removes = new Set<string>();
  const renames = new Set<string>();
  const deletes = new Set<string>();
  const gedus = new Set<string>();
  let creating = false;

  for (const { action, vars } of entries) {
    if (
      (action === "move" || action === "promote" || action === "demote") &&
      vars?.participationId
    ) {
      // Promote/demote grey the chip the same way a move does — it's in flight
      // and shouldn't be re-dragged until the snapshot settles.
      moves.add(vars.participationId);
    } else if (action === "removeGamer" && vars?.participationId) {
      removes.add(vars.participationId);
    } else if (action === "rename" && vars?.groupId) {
      renames.add(vars.groupId);
    } else if (action === "delete" && vars?.groupId) {
      deletes.add(vars.groupId);
    } else if (
      (action === "addGedu" || action === "removeGedu") &&
      vars?.groupId &&
      vars.geduId
    ) {
      gedus.add(`${vars.groupId}:${vars.geduId}`);
    } else if (action === "create") {
      creating = true;
    }
  }

  return { moves, removes, renames, deletes, gedus, creating };
}
