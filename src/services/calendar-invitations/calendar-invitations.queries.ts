"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { calendarFeedKeys } from "@/services/calendar-feed";
import { CalendarInvitationsService } from "./calendar-invitations.service";
import type {
  CalendarInvitationBody,
  CalendarInvitationResponse,
} from "./calendar-invitations.contracts";

export const calendarInvitationKeys = {
  all: ["calendar-invitations"] as const,
  sends: () => [...calendarInvitationKeys.all, "send"] as const,
};

/**
 * Render an invitation, and send it unless the body asks for a preview.
 *
 * A mutation for both, even though a preview writes nothing: an admin *asks*
 * for either by pressing a button, and neither should be re-run by a window
 * focus or a cache miss.
 *
 * The invalidation is of the **feed's** sandbox key rather than one of its own,
 * because the bookkeeping this write produces is stored inside the sandbox
 * document and the card reads its status line straight out of that query. A
 * preview writes nothing, so it invalidates nothing — the `messageId` is what
 * says which happened.
 */
export function useSendCalendarInvitation() {
  const queryClient = useQueryClient();
  return useMutation<
    CalendarInvitationResponse,
    Error,
    CalendarInvitationBody
  >({
    mutationKey: calendarInvitationKeys.sends(),
    mutationFn: (body) =>
      new CalendarInvitationsService(getClient()).send(body),
    onSuccess: (data) => {
      if (data.messageId === null) return;
      void queryClient.invalidateQueries({ queryKey: calendarFeedKeys.all });
    },
  });
}
