import type { SupabaseClient } from "@supabase/supabase-js";
import type { MinecraftAccount, Database } from "@/types";

export class MinecraftService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getMyMinecraftAccount(): Promise<MinecraftAccount | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.supabase
      .from("minecraft_accounts")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async getMinecraftAccount(userId: string): Promise<MinecraftAccount | null> {
    const { data, error } = await this.supabase
      .from("minecraft_accounts")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async verifyMinecraftUsername(
    username: string,
  ): Promise<{ username: string; uuid: string }> {
    const response = await fetch(
      `/api/minecraft/verify?username=${encodeURIComponent(username)}`,
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Verification failed");
    }
    return data;
  }

  async updateMyMinecraft(
    minecraftUsername: string | null,
  ): Promise<void> {
    const response = await fetch("/api/minecraft/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minecraftUsername }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to update Minecraft username");
    }
  }
}
