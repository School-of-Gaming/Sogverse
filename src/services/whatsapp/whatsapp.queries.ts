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
      return data;
    },
    // Optimistic update: immediately add the message to the query cache
    // so there's a single source of truth (the messages array).
    onMutate: async ({ to, body }) => {
      await queryClient.cancelQueries({ queryKey: whatsappKeys.messages(to) });

      const previous = queryClient.getQueryData<WhatsAppMessage[]>(
        whatsappKeys.messages(to)
      );

      const optimistic: WhatsAppMessage = {
        id: `pending-${Date.now()}`,
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

      return { previous };
    },
    onError: (_err, { to }, context) => {
      // Roll back optimistic update on failure
      if (context?.previous) {
        queryClient.setQueryData(whatsappKeys.messages(to), context.previous);
      }
    },
    onSettled: (_data, _error, { to }) => {
      // Refetch to sync with server (safe fallback alongside Realtime)
      queryClient.invalidateQueries({ queryKey: whatsappKeys.messages(to) });
      queryClient.invalidateQueries({ queryKey: whatsappKeys.contacts() });
    },
  });
}
