"use client";

import { useMutation } from "@tanstack/react-query";
import { getClient } from "@/lib/supabase/client";
import { MinecraftEducationService } from "./minecraft-education.service";

export const minecraftEducationKeys = {
  all: ["minecraft-education"] as const,
};

/**
 * Reset the Minecraft Education password for a batch of usernames.
 *
 * **Nothing is invalidated on success, and there is nothing to invalidate.**
 * The accounts live in the sog.gg Azure AD tenant, not in our database, and
 * this feature has no read of its own — the new passwords exist only in the
 * mutation's own result, which is what the card renders. The keys factory above
 * is kept for shape (every feature has one, and a future read here would hang
 * off it) rather than because a cache entry exists under it today.
 */
export function useResetMinecraftPasswords() {
  const supabase = getClient();
  const service = new MinecraftEducationService(supabase);

  return useMutation({
    mutationFn: (usernames: readonly string[]) =>
      service.resetPasswords(usernames),
  });
}
