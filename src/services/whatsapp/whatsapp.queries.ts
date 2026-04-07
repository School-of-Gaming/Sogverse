"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { WhatsAppService } from "./whatsapp.service";
import type { WhatsAppMessage } from "@/types";

export const whatsappKeys = {
  all: ["whatsapp"] as const,
  contacts: () => [...whatsappKeys.all, "contacts"] as const,
  messages: (phone: string) => [...whatsappKeys.all, "messages", phone] as const,
};

export function useWhatsAppContacts() {
  const supabase = getClient();
  const service = new WhatsAppService(supabase);

  return useQuery({
    queryKey: whatsappKeys.contacts(),
    queryFn: () => service.getContacts(),
  });
}

export function useWhatsAppMessages(phone: string | null) {
  const supabase = getClient();
  const service = new WhatsAppService(supabase);

  return useQuery({
    queryKey: whatsappKeys.messages(phone ?? ""),
    queryFn: () => service.getMessages(phone!),
    enabled: !!phone,
  });
}

export function useSendWhatsAppMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ to, body }: { to: string; body: string }) => {
      const res = await fetch("/api/admin/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data as { messageId: string };
    },
    onMutate: async ({ to, body }) => {
      await queryClient.cancelQueries({ queryKey: whatsappKeys.messages(to) });

      const previous = queryClient.getQueryData<WhatsAppMessage[]>(
        whatsappKeys.messages(to)
      );

      const tempId = `pending-${Date.now()}`;
      const optimistic: WhatsAppMessage = {
        id: tempId,
        phone: to.replace(/^\+/, ""),
        direction: "outbound",
        body,
        message_type: "text",
        raw_payload: null,
        status: "pending",
        status_error: null,
        created_at: new Date().toISOString(),
      };

      queryClient.setQueryData<WhatsAppMessage[]>(
        whatsappKeys.messages(to),
        (old) => [...(old ?? []), optimistic]
      );

      return { previous, tempId };
    },
    onSuccess: (data, { to }, context) => {
      // Swap the temp ID with the real Meta message ID so that
      // subsequent Realtime UPDATE events (delivered/read/failed)
      // can match by ID and patch the cache directly.
      if (!context?.tempId) return;
      queryClient.setQueryData<WhatsAppMessage[]>(
        whatsappKeys.messages(to),
        (old) =>
          old?.map((msg) =>
            msg.id === context.tempId
              ? { ...msg, id: data.messageId, status: "sent" }
              : msg
          )
      );
    },
    onError: (_err, { to }, context) => {
      if (context?.previous) {
        queryClient.setQueryData(whatsappKeys.messages(to), context.previous);
      }
    },
    onSettled: (_data, _error, { to }) => {
      // Refetch contacts to update last_message_at ordering.
      // Message cache is already correct from onSuccess/onError +
      // Realtime handles ongoing status updates (delivered/read).
      queryClient.invalidateQueries({ queryKey: whatsappKeys.contacts() });
    },
  });
}
