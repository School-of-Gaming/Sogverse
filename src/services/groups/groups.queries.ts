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
    // The one place display order is decided — runs over both server data and
    // optimistically-patched cache, so they can never disagree. See
    // orderSnapshotForDisplay.
    select: orderSnapshotForDisplay,
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

// ─── Display ordering (frontend-owned) ───────────────────────────────────────
//
// The RPC returns each list in a deterministic-but-arbitrary order (by id) and
// hands us the timestamps to sort by; the client decides display order. This is
// the single sort policy — applied in `useProductGroups`'s `select`, so it runs
// identically over server data and over optimistically-patched cache. Because
// there's exactly one sort (not a server ORDER BY plus a client guess), an
// optimistic chip can't disagree with the settled order, so nothing jumps on
// reconcile. The rule everywhere: most-recently-touched sorts last.
//   - groups by created_at (newest group last)
//   - participations by updated_at (a move bumps it, so the moved chip goes last)
//   - group Gedus by assigned_at (a freshly added Gedu goes last)
// Ties break by id. Comparison is by parsed instant (getTime), so the optimistic
// `toISOString()` "Z" form and Postgres's "+00:00" form compare correctly.

type Participation = ProductGroupsSnapshot["unassigned"][number];

const byInstantThenId = (
  aTime: string,
  bTime: string,
  aId: string,
  bId: string,
): number =>
  new Date(aTime).getTime() - new Date(bTime).getTime() ||
  aId.localeCompare(bId);

const sortParticipations = (list: Participation[]): Participation[] =>
  [...list].sort((a, b) =>
    byInstantThenId(a.updated_at, b.updated_at, a.id, b.id),
  );

export function orderSnapshotForDisplay(
  snapshot: ProductGroupsSnapshot,
): ProductGroupsSnapshot {
  return {
    ...snapshot,
    groups: [...snapshot.groups]
      .sort((a, b) => byInstantThenId(a.created_at, b.created_at, a.id, b.id))
      .map((g) => ({
        ...g,
        gedus: [...g.gedus].sort((a, b) =>
          byInstantThenId(a.assigned_at, b.assigned_at, a.id, b.id),
        ),
        participations: sortParticipations(g.participations),
      })),
    unassigned: sortParticipations(snapshot.unassigned),
  };
}

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
  // Bump updated_at so the display sort lands it at the end of its new list —
  // mirrors what the move's UPDATE does server-side (the real updated_at the
  // settle refetch returns will likewise be the newest).
  const landed: Participation = { ...moved, updated_at: new Date().toISOString() };

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
            // Newest assignment → sorts last, matching the settle refetch.
            assigned_at: new Date().toISOString(),
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
