"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { WhatsAppService } from "./whatsapp.service";

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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: whatsappKeys.messages(variables.to) });
      queryClient.invalidateQueries({ queryKey: whatsappKeys.contacts() });
    },
  });
}
