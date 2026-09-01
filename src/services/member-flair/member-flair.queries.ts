"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { assignmentKeys } from "@/services/assignments/assignments.keys";
import { geduSessionKeys } from "@/services/gedu-sessions/gedu-sessions.keys";
import { groupsKeys } from "@/services/groups/groups.queries";
import type { GamerCreation } from "./member-flair.contracts";
import { memberFlairKeys } from "./member-flair.keys";
import { MemberFlairService } from "./member-flair.service";

/**
 * React Query bindings for the staff overlay and the two (group, member)
 * writes: the private note, and the creations list beside it.
 */

/**
 * One group's staff-only marks.
 *
 * **A category-2 read**: small, indexed and bounded — one group's active
 * members, which is single figures to low tens. It lands in a frame or two, so
 * a surface built on it renders **nothing** while it is in flight, inside a
 * container already at its final size. No skeleton, no spinner, no delay.
 *
 * That is safe because the rows this lands on are **additive by construction**:
 * the newcomer badge is last on the identity line and the note button is the
 * left edge of a right-packed trailing group, so both grow into the row's slack
 * and nothing already painted moves. Reordering either reintroduces the shift
 * this arrangement avoids.
 *
 * `enabled` is the caller's own gate — the moderator flag in the voice room —
 * and exists **only to avoid firing a request that would be refused**. The
 * RPC's `42501` is the actual boundary, and a refused caller is handed `null`.
 * A null `groupId` (an instant voice room) is folded into the same gate, since
 * there is no group to ask about.
 */
export function useGroupStaffOverlay(groupId: string | null, enabled: boolean) {
  const service = new MemberFlairService(getClient());

  return useQuery({
    queryKey: memberFlairKeys.overlay(groupId ?? ""),
    queryFn: () => service.getGroupStaffOverlay(groupId ?? ""),
    enabled: enabled && groupId !== null && groupId.length > 0,
  });
}

/**
 * Write, replace or clear one member's note in this group.
 *
 * The documents it invalidates, and why those, are in
 * {@link invalidateStaffFlairDocuments} — shared with the creations write below,
 * which rides exactly the same set.
 */
export function useSetGamerGroupNote(groupId: string) {
  const queryClient = useQueryClient();
  const service = new MemberFlairService(getClient());

  return useMutation({
    mutationFn: (vars: { participantId: string; note: string }) =>
      service.setGamerGroupNote({ groupId, ...vars }),
    onSuccess: () => {
      invalidateStaffFlairDocuments(queryClient, groupId);
    },
  });
}

/**
 * Replace one member's creations in this group.
 *
 * **The same staff documents, and deliberately no family key.** The note and the
 * creations list ride the same three staff documents, so a write to either
 * invalidates the same set — see {@link invalidateStaffFlairDocuments}.
 *
 * The family product page carries this list too, and its key is **not**
 * invalidated, which is a decision rather than an omission: the writer is always
 * staff (an admin, or a gedu assigned to the product), and a staff client never
 * holds a family cache entry to go stale. The family's own next visit reads the
 * document fresh.
 */
export function useSetGamerGroupCreations(groupId: string) {
  const queryClient = useQueryClient();
  const service = new MemberFlairService(getClient());

  return useMutation({
    mutationFn: (vars: {
      participantId: string;
      creations: readonly GamerCreation[];
    }) => service.setGamerGroupCreations({ groupId, ...vars }),
    onSuccess: () => {
      invalidateStaffFlairDocuments(queryClient, groupId);
    },
  });
}

/**
 * **Four keys, because four documents carry a member's staff flair.** The first
 * three are what the live surfaces read: the overlay behind the voice room, the
 * gedu group feed's roster (the copy the gedu product page actually renders),
 * and the gedu assignment document. `groupsKeys.all` is there because the admin
 * snapshot *carries* the note too, and a document holding a stale note is a
 * document holding a wrong one.
 *
 * The last two are invalidated at the top of their hierarchies rather than by
 * id: a flair write knows a group, not a product, and each is one cheap
 * staff-only single-document read on a low-traffic surface.
 *
 * Shared by both writes so the two cannot drift into invalidating different
 * sets — the note and the creations list sit side by side in one dialog and ride
 * the same documents, so a key added for one is a key the other needs too.
 */
function invalidateStaffFlairDocuments(
  queryClient: ReturnType<typeof useQueryClient>,
  groupId: string,
): void {
  void queryClient.invalidateQueries({
    queryKey: memberFlairKeys.overlay(groupId),
  });
  void queryClient.invalidateQueries({
    queryKey: geduSessionKeys.feed(groupId),
  });
  void queryClient.invalidateQueries({ queryKey: assignmentKeys.all });
  void queryClient.invalidateQueries({ queryKey: groupsKeys.all });
}
