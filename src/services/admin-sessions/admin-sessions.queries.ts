"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import type { AttendanceStatus } from "@/services/gedu-sessions/gedu-sessions.contracts";
import { adminSessionKeys } from "./admin-sessions.keys";
import { AdminSessionsService } from "./admin-sessions.service";

/**
 * React Query bindings for the admin product page's Sessions panel.
 *
 * **Every mutation here invalidates one key: the product's document.** That is
 * the whole point of the product-keyed read — the panel shows one group at a
 * time out of a document holding all of them, so a note, a mark or a send lands
 * back in the same place whichever group it was made against, and switching
 * groups afterwards shows the fresh answer rather than the one that was cached
 * before the edit.
 *
 * They deliberately do **not** touch the gedu feed's keys. Those caches belong
 * to a gedu's session in a gedu's browser; an admin's client has never held one,
 * so invalidating them would be a no-op dressed up as thoroughness.
 */

/**
 * The product's whole session record.
 *
 * Heavy by construction — every group's entire history in one document — and
 * nothing prefetches it, so the panel is on the slow-call side of the loading
 * rule and paints a structured skeleton immediately.
 */
export function useAdminProductSessions(productId: string) {
  const service = new AdminSessionsService(getClient());

  return useQuery({
    queryKey: adminSessionKeys.byProduct(productId),
    queryFn: () => service.getProductSessions(productId),
    enabled: productId.length > 0,
  });
}

export function useAdminSetSessionNotes(productId: string, groupId: string) {
  const queryClient = useQueryClient();
  const service = new AdminSessionsService(getClient());

  return useMutation({
    mutationFn: (vars: {
      sessionDate: string;
      report: string;
      geduNote: string;
    }) => service.setSessionNotes({ groupId, ...vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: adminSessionKeys.byProduct(productId),
      });
    },
  });
}

export function useAdminRecordAttendance(productId: string, groupId: string) {
  const queryClient = useQueryClient();
  const service = new AdminSessionsService(getClient());

  return useMutation({
    mutationFn: (vars: {
      sessionDate: string;
      participantId: string;
      status: AttendanceStatus | null;
    }) => service.recordAttendance({ groupId, ...vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: adminSessionKeys.byProduct(productId),
      });
    },
  });
}

/**
 * Email one session's report to the group's families.
 *
 * **On settled rather than on success**, exactly as the gedu hook is, and for
 * the same reason: this send's refusals are *news about the row*. Being told
 * the report has already gone means the card in front of the admin is out of
 * date, and the refetched row arriving stamped is the only thing that makes it
 * tell the truth again — the card says nothing about that refusal itself.
 */
export function useAdminEmailSessionReport(productId: string, groupId: string) {
  const queryClient = useQueryClient();
  const service = new AdminSessionsService(getClient());

  return useMutation({
    mutationFn: (vars: { sessionDate: string }) =>
      service.emailSessionReport({ groupId, ...vars }),
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: adminSessionKeys.byProduct(productId),
      });
    },
  });
}

export function useAdminSetGroupNotes(productId: string, groupId: string) {
  const queryClient = useQueryClient();
  const service = new AdminSessionsService(getClient());

  return useMutation({
    mutationFn: (vars: { publicNote: string; geduNote: string }) =>
      service.setGroupNotes({ groupId, ...vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: adminSessionKeys.byProduct(productId),
      });
    },
  });
}

/**
 * Write the venue's two shared notes.
 *
 * The address is not a parameter and never travels: it belongs to the location
 * record and is edited there. That is a property of the RPC rather than a
 * choice this hook makes, and it is what stops a page loaded before somebody
 * corrected the address from quietly reverting the correction on the next note
 * save.
 *
 * Site notes are shared by every product at the building, so in principle every
 * other product's document is now stale. Only the one being looked at is worth
 * refetching; the rest pick the change up when they are next opened.
 */
export function useAdminSetSiteNotes(productId: string) {
  const queryClient = useQueryClient();
  const service = new AdminSessionsService(getClient());

  return useMutation({
    mutationFn: (vars: {
      locationId: string;
      publicNote: string;
      geduNote: string;
    }) => service.setSiteNotes(vars),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: adminSessionKeys.byProduct(productId),
      });
    },
  });
}
