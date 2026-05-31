import type { MinecraftAccount, AppSupabaseClient } from "@/types";

export class MinecraftService {
  constructor(private supabase: AppSupabaseClient) {}

  async getMyMinecraftAccount(): Promise<MinecraftAccount | null> {
    const { data: claims } = await this.supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (!userId) return null;

    const { data, error } = await this.supabase
      .from("minecraft_accounts")
      .select("*")
      .eq("user_id", userId)
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
