import type { Profile, ProfileUpdate, UserRole, ParentGamer, SpokenLanguage, AppSupabaseClient } from "@/types";
import { escapeLikePattern } from "@/lib/utils";
import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import {
  adminGameAccountWriteResult,
  type AdminGameAccountBody,
  type AdminGameAccountWriteResult,
} from "./users.contracts";

export class UsersService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * An admin setting or clearing another account's game username.
   *
   * Deliberately a separate method from the two self-serve ones rather than a
   * flag on them: those cannot name a target at all, which is most of what makes
   * them safe, and collapsing them would put a "whose account is this" branch
   * inside a method whose safety comes from not having one.
   *
   * The route resolves the handle against the platform before writing, so a
   * successful save lands *verified* and the result carries the account key.
   */
  async updateUserGameAccount(
    userId: string,
    edit: AdminGameAccountBody,
  ): Promise<AdminGameAccountWriteResult> {
    const response = await fetch(
      `/api/admin/users/${encodeURIComponent(userId)}/game-account`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      },
    );

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to update the game username"),
      );
    }

    return parseJsonResponse(response, adminGameAccountWriteResult);
  }

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
      .or(`email.ilike.%${escapeLikePattern(query)}%,first_name.ilike.%${escapeLikePattern(query)}%,last_name.ilike.%${escapeLikePattern(query)}%`)
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
}
