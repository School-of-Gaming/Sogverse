import type { Profile, ProfileUpdate, UserRole, ParentGamer } from "@/types";

// Using generic type to avoid version-specific Supabase type incompatibilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

export class UsersService {
  constructor(private supabase: SupabaseClientType) {}

  async getProfile(userId: string): Promise<Profile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) throw error;
    return data;
  }

  async updateProfile(userId: string, updates: ProfileUpdate): Promise<Profile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;

    // Sync display_name to auth.users metadata so it shows in Supabase dashboard
    if (updates.display_name !== undefined) {
      await this.supabase.auth.updateUser({
        data: { display_name: updates.display_name },
      });
    }

    return data;
  }

  async getAllUsers(): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  }

  async getUsersByRole(role: UserRole): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .eq("role", role)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  }

  async searchUsers(query: string): Promise<Profile[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .or(`email.ilike.%${query}%,username.ilike.%${query}%,display_name.ilike.%${query}%`)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    return data;
  }

  async getAllParentGamerLinks(): Promise<ParentGamer[]> {
    const { data, error } = await this.supabase
      .from("parent_gamer")
      .select("*");

    if (error) throw error;
    return data;
  }

  async createGedu(email: string, password: string, displayName?: string): Promise<void> {
    const response = await fetch("/api/admin/create-gedu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, displayName }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to create gedu account");
    }
  }
}
