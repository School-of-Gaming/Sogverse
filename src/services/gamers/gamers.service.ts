import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, ParentGamer, CreateGamerInput, GamerProfile, Database } from "@/types";

export class GamerService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async getLinkedGamers(parentId: string): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("parent_gamer")
      .select(`
        gamer:profiles!parent_gamer_gamer_id_fkey (*)
      `)
      .eq("parent_id", parentId);

    if (error) throw error;
    return data.map((row: { gamer: unknown }) => row.gamer as Profile);
  }

  async getLinkedParents(gamerId: string): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("parent_gamer")
      .select(`
        parent:profiles!parent_gamer_parent_id_fkey (*)
      `)
      .eq("gamer_id", gamerId);

    if (error) throw error;
    return data.map((row: { parent: unknown }) => row.parent as Profile);
  }

  async getMyGamers(): Promise<Profile[]> {
    const { data, error } = await this.supabase.rpc("get_my_gamers");
    if (error) throw error;
    return data;
  }

  async getMyParents(): Promise<Profile[]> {
    const { data, error } = await this.supabase.rpc("get_my_parents");
    if (error) throw error;
    return data;
  }

  async isParentOf(gamerId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("is_parent_of", {
      gamer_uuid: gamerId,
    });
    if (error) return false;
    return data;
  }

  async getGamerProfile(gamerId: string): Promise<GamerProfile> {
    const { data, error } = await this.supabase
      .from("gamer_profiles")
      .select("*")
      .eq("user_id", gamerId)
      .single();

    if (error) throw error;
    return data as GamerProfile;
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
    const response = await fetch("/api/gamer/minecraft", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minecraftUsername }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to update Minecraft username");
    }
  }

  async createGamerAccount(
    _parentId: string,
    input: CreateGamerInput
  ): Promise<{ gamer: Profile; link: ParentGamer }> {
    const response = await fetch("/api/gamers/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: input.username,
        password: input.password,
        displayName: input.displayName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        minecraftUsername: input.minecraftUsername,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to create gamer account");
    }

    return { gamer: data.gamer, link: data.link };
  }

  async updateGamer(
    gamerId: string,
    updates: { displayName?: string; password?: string; minecraftUsername?: string | null },
  ): Promise<Profile> {
    const response = await fetch(`/api/gamers/${gamerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to update gamer");
    }

    return data.gamer;
  }

  async getParentGamerLinks(parentId: string): Promise<ParentGamer[]> {
    const { data, error } = await this.supabase
      .from("parent_gamer")
      .select("*")
      .eq("parent_id", parentId);

    if (error) throw error;
    return data;
  }
}
