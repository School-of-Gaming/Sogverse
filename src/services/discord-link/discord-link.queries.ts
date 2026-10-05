"use client";

import { useQuery } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { DiscordLinkService } from "./discord-link.service";

export const discordLinkKeys = {
  all: ["discord-links"] as const,
  linkedAccounts: () => [...discordLinkKeys.all, "linked-accounts"] as const,
};

/** Every linked Discord account, for an admin. */
export function useLinkedDiscordAccounts() {
  return useQuery({
    queryKey: discordLinkKeys.linkedAccounts(),
    queryFn: () => new DiscordLinkService(getClient()).listLinkedAccounts(),
  });
}
