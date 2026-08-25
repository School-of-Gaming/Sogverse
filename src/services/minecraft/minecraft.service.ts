import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import type { MinecraftAccount, AppSupabaseClient } from "@/types";
import { minecraftAccountWriteResult } from "./minecraft.contracts";

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

  /**
   * A gedu correcting the Minecraft username of a child in a group they teach —
   * and, since 00205, an admin doing the same from the group details page,
   * which renders that roster and its editor unchanged.
   *
   * Deliberately a separate method from `updateMyMinecraft` rather than a flag
   * on it: the two hit different routes with different authorization, and one
   * of them names a target while the other cannot. Collapsing them would put a
   * "whose account is this" branch inside a method whose safety comes from not
   * having one.
   *
   * The route resolves the name against Mojang before writing, so the result
   * carries the canonical spelling and the UUID — a successful save lands
   * verified, and the caller renders that state from what comes back rather
   * than guessing at it.
   */
  async updateGroupMemberMinecraft(
    gamerId: string,
    minecraftUsername: string | null,
  ) {
    const response = await fetch(
      `/api/gedu/gamers/${encodeURIComponent(gamerId)}/minecraft`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minecraftUsername }),
      },
    );

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(
          response,
          "Failed to update the Minecraft username",
        ),
      );
    }

    return parseJsonResponse(response, minecraftAccountWriteResult);
  }
}
