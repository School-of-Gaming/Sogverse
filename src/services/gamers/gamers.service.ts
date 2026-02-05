import type { Profile, ParentGamer, CreateGamerInput } from "@/types";
import { generateGamerEmail } from "@/lib/utils";

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
    parentId: string,
    input: CreateGamerInput
  ): Promise<{ gamer: Profile; link: ParentGamer }> {
    // This requires the admin client to create the auth user
    // The actual implementation would be in an API route that uses the admin client

    const syntheticEmail = generateGamerEmail(input.username);

    // Create auth user (this should be done server-side with admin client)
    const { data: authData, error: authError } =
      await this.supabase.auth.signUp({
        email: syntheticEmail,
        password: input.password,
        options: {
          data: {
            display_name: input.displayName || input.username,
            role: "gamer",
            username: input.username,
          },
        },
      });

    if (authError) throw authError;
    if (!authData.user) throw new Error("Failed to create gamer account");

    // Wait a moment for the trigger to create the profile
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get the created profile
    const { data: gamerProfile, error: profileError } = await this.supabase
      .from("profiles")
      .select("*")
      .eq("id", authData.user.id)
      .single();

    if (profileError) throw profileError;

    // Create parent-gamer link
    const { data: linkData, error: linkError } = await this.supabase
      .from("parent_gamer")
      .insert({
        parent_id: parentId,
        gamer_id: authData.user.id,
      })
      .select()
      .single();

    if (linkError) throw linkError;

    return {
      gamer: gamerProfile,
      link: linkData,
    };
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

  async unlinkGamer(parentId: string, gamerId: string): Promise<void> {
    const { error } = await this.supabase
      .from("parent_gamer")
      .delete()
      .eq("parent_id", parentId)
      .eq("gamer_id", gamerId);

    if (error) throw error;
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
