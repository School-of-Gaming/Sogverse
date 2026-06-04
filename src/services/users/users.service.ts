import type { Profile, ProfileUpdate, UserRole, ParentGamer, SpokenLanguage, AppSupabaseClient } from "@/types";
import { escapeLikePattern } from "@/lib/utils";

export class UsersService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Reference set of spoken (human) languages from the `spoken_languages`
   * table. Public reference data — used by the shop's language filter (anon-
   * readable). Distinct from the UI locale (see CLAUDE.md "Locale vs. Spoken
   * Language").
   */
  async getSpokenLanguages(): Promise<SpokenLanguage[]> {
    const { data, error } = await this.supabase
      .from("spoken_languages")
      .select("code, name");

    if (error) throw error;
    return data;
  }

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

    // Sync name fields to auth.users metadata so they show in the Supabase
    // dashboard. Keep writing display_name (composed) for the dashboard label,
    // and first_name/last_name separately for tooling that prefers them.
    if (updates.first_name !== undefined || updates.last_name !== undefined) {
      const composed = [data.first_name, data.last_name].filter(Boolean).join(" ");
      await this.supabase.auth.updateUser({
        data: {
          first_name: data.first_name,
          last_name: data.last_name,
          display_name: composed,
        },
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
      .or(`email.ilike.%${escapeLikePattern(query)}%,username.ilike.%${escapeLikePattern(query)}%,first_name.ilike.%${escapeLikePattern(query)}%,last_name.ilike.%${escapeLikePattern(query)}%`)
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

  async createGedu(
    email: string,
    firstName: string,
    lastName: string | null,
    locale?: string,
  ): Promise<{ warning?: string }> {
    const response = await fetch("/api/admin/create-gedu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, firstName, lastName, locale }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to create gedu account");
    }

    return data;
  }
}
