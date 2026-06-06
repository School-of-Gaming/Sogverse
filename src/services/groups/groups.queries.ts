"use client";

import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
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

function withParticipationMoved(
  snapshot: ProductGroupsSnapshot,
  participationId: string,
  toGroupId: string | null,
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
  };

  if (!moved) return snapshot;
  // Append to the end of the destination list. The server orders by updated_at,
  // and the move bumps updated_at, so the settle refetch lands it here too.
  const landed = moved;

  if (toGroupId === null) {
    return { ...stripped, unassigned: [...stripped.unassigned, landed] };
  }
  return {
    ...stripped,
    groups: stripped.groups.map((g) =>
      g.id === toGroupId
        ? { ...g, participations: [...g.participations, landed] }
        : g,
    ),
  };
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
          withParticipationMoved(previous, participationId, toGroupId),
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

interface RemoveGeduVars {
  groupId: string;
  geduId: string;
}

export function useRemoveGedu(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  // Destructive: no optimistic removal. The pill greys while saving (pending
  // registry) and disappears on the settle refetch.
  return useMutation({
    mutationKey: [...groupMutationBase(productId), "removeGedu"],
    mutationFn: ({ groupId, geduId }: RemoveGeduVars) =>
      service.removeGedu(productId, groupId, geduId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

interface DeleteVars {
  groupId: string;
}

export function useDeleteGroup(productId: string) {
  const queryClient = useQueryClient();
  const service = new GroupsService(getClient());
  const key = groupsKeys.byProduct(productId);

  // Destructive: no optimistic removal. The card greys while saving and is
  // removed on the settle refetch (which also reflects the gamers cascading
  // back to unassigned).
  return useMutation({
    mutationKey: [...groupMutationBase(productId), "delete"],
    mutationFn: ({ groupId }: DeleteVars) =>
      service.deleteGroup(productId, groupId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
    },
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

export interface GroupPending {
  /** participation ids with an in-flight move */
  moves: Set<string>;
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
    select: (mutation) => ({
      action: mutation.options.mutationKey?.at(-1) as string | undefined,
      vars: mutation.state.variables as PendingVars | undefined,
    }),
  });

  const moves = new Set<string>();
  const renames = new Set<string>();
  const deletes = new Set<string>();
  const gedus = new Set<string>();
  let creating = false;

  for (const { action, vars } of entries) {
    if (action === "move" && vars?.participationId) {
      moves.add(vars.participationId);
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

  return { moves, renames, deletes, gedus, creating };
}
