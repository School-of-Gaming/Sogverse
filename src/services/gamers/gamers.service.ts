import type { Profile, GamerProfileRow, ParentGamer, CreateGamerInput, GamerProfile, AppSupabaseClient } from "@/types";
import { isGamerProfile } from "@/types";

export class GamerService {
  constructor(private supabase: AppSupabaseClient) {}

  async getLinkedGamers(parentId: string): Promise<GamerProfileRow[]> {
    const { data, error } = await this.supabase
      .from("parent_gamer")
      .select(`
        gamer:profiles!parent_gamer_gamer_id_fkey!inner (*)
      `)
      .eq("parent_id", parentId);

    if (error) throw error;
    // `!inner` makes `gamer` a non-null Profile; `isGamerProfile` narrows it to
    // the username-non-null `GamerProfileRow` (the auth_identifier_check CHECK
    // guarantees username for gamers — see types/index.ts). The link FK only
    // ever points at gamer profiles, so the guard never drops a row; it
    // replaces the old `as GamerProfileRow` cast with a checked narrowing.
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

  async getMyGamers(): Promise<GamerProfileRow[]> {
    const { data, error } = await this.supabase.rpc("get_my_gamers");
    if (error) throw error;
    return data as GamerProfileRow[];
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
  ): Promise<{ gamer: Profile; link: ParentGamer }> {
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

    return { gamer: data.gamer, link: data.link };
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
