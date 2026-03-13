import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile, UserRole, Database } from "@/types";
import { generateGamerEmail } from "@/lib/utils";

export class AuthService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async signInWithEmail(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  }

  async signInWithUsername(username: string, password: string) {
    const syntheticEmail = generateGamerEmail(username);
    return this.signInWithEmail(syntheticEmail, password);
  }

  async signUp(
    email: string,
    password: string,
    options?: { displayName?: string; role?: UserRole }
  ) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: options?.displayName,
          role: options?.role || "customer",
        },
      },
    });

    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async resetPassword(email: string, redirectTo?: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    if (error) throw error;
  }

  async updatePassword(newPassword: string) {
    const { error } = await this.supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  }

  async getSession() {
    const { data, error } = await this.supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async getUser() {
    const { data, error } = await this.supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  }

  async getProfile(): Promise<Profile> {
    const user = await this.getUser();

    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error) throw error;
    return data;
  }

  async getUserRole(): Promise<UserRole | null> {
    const { data, error } = await this.supabase.rpc("get_user_role");
    if (error) return null;
    return data;
  }
}
