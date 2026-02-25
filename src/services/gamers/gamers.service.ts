import type { Profile, ParentGamer, CreateGamerInput } from "@/types";

// Using generic type to avoid version-specific Supabase type incompatibilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

export class GamerService {
  constructor(private supabase: SupabaseClientType) {}

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
    return data || [];
  }

  async getMyParents(): Promise<Profile[]> {
    const { data, error } = await this.supabase.rpc("get_my_parents");
    if (error) throw error;
    return data || [];
  }

  async isParentOf(gamerId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("is_parent_of", {
      gamer_uuid: gamerId,
    });
    if (error) return false;
    return data || false;
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
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to create gamer account");
    }

    return { gamer: data.gamer, link: data.link };
  }

  async linkGamer(parentId: string, gamerId: string): Promise<ParentGamer> {
    const { data, error } = await this.supabase
      .from("parent_gamer")
      .insert({
        parent_id: parentId,
        gamer_id: gamerId,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
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
