import type { Profile, ParentGamer, CreateGamerInput, GamerProfile, AppSupabaseClient } from "@/types";
import { isGamerProfile } from "@/types";

export class GamerService {
  constructor(private supabase: AppSupabaseClient) {}

  async getLinkedGamers(parentId: string): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("parent_gamer")
      .select(`
        gamer:profiles!parent_gamer_gamer_id_fkey!inner (*)
      `)
      .eq("parent_id", parentId);

    if (error) throw error;
    // `!inner` makes `gamer` a non-null Profile; the link FK only ever points
    // at gamer profiles, so `isGamerProfile` never drops a row — it just drops
    // the nullable embed type without a cast.
    return data.map((row) => row.gamer).filter(isGamerProfile);
  }

  async getLinkedParents(gamerId: string): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("parent_gamer")
      .select(`
        parent:profiles!parent_gamer_parent_id_fkey!inner (*)
      `)
      .eq("gamer_id", gamerId);

    if (error) throw error;
    return data.map((row) => row.parent);
  }

  async getMyGamers(): Promise<Profile[]> {
    const { data, error } = await this.supabase.rpc("get_my_gamers");
    if (error) throw error;
    // Every row this RPC returns is a gamer, so the filter is a no-op that
    // drops the nullable type without a cast.
    return data.filter(isGamerProfile);
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

  async createGamerAccount(
    _parentId: string,
    input: CreateGamerInput
  ): Promise<{ gamer: Profile }> {
    const response = await fetch("/api/gamers/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: input.firstName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        minecraftUsername: input.minecraftUsername,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to create gamer account");
    }

    return { gamer: data.gamer };
  }

  async updateGamer(
    gamerId: string,
    updates: { firstName?: string; password?: string; minecraftUsername?: string | null },
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
