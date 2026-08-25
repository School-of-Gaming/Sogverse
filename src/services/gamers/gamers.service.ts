import type {
  Profile,
  ParentGamer,
  CreateGamerInput,
  GamerProfile,
  GenderType,
  AppSupabaseClient,
} from "@/types";
import { isGamerProfile } from "@/types";
import { ApiError } from "@/lib/api/api-error";

/**
 * What a parent may change about one of their gamers, one field at a time.
 *
 * Named rather than inlined because the mutation hook and this method have to
 * agree on it exactly — they drifted once already, and a game platform added to
 * one but not the other is a field the UI can set and the request never carries.
 * A `null` game username unlinks that platform; an absent key leaves it alone.
 */
export interface GamerUpdate {
  firstName?: string;
  password?: string;
  minecraftUsername?: string | null;
  robloxUsername?: string | null;
}

/**
 * The two facts a gamer's own profile row holds beyond the link to their
 * account: when they were born and, optionally, their gender.
 *
 * Both are written together because they are edited together — the admin card
 * that owns them saves the whole pair on one button, so there is no partial
 * shape to express. `gender` is genuinely nullable: "not specified" is an
 * answer, and clearing it is a write of `null` rather than an omission.
 */
export interface GamerProfileEdit {
  /** `YYYY-MM-DD`, composed by `assembleGamerDateOfBirth`. */
  dateOfBirth: string;
  gender: GenderType | null;
}

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

  /**
   * Writes a gamer's birth date and gender, returning the stored row.
   *
   * **Through the injected client rather than an API route.** Nothing here
   * needs a server-side secret: `gamer_profiles` already carries a `FOR ALL`
   * admin policy over `is_admin()` and `authenticated` already holds UPDATE on
   * the table, so the caller's own session is the authorization — and adding a
   * route would only put our own re-check of `is_admin()` in front of the
   * database's. The `date_of_birth <= CURRENT_DATE` CHECK still stands behind
   * it, so a future date fails loudly at the schema rather than storing.
   *
   * The updated row is returned (rather than the caller re-reading it) so the
   * mutation can seed the profile cache with it: the card that saves is showing
   * the very row that changed, and a refetch round trip between the click and
   * the new value is exactly the gap a stale readout lives in.
   */
  async updateGamerProfile(
    gamerId: string,
    edit: GamerProfileEdit,
  ): Promise<GamerProfile> {
    const { data, error } = await this.supabase
      .from("gamer_profiles")
      .update({ date_of_birth: edit.dateOfBirth, gender: edit.gender })
      .eq("user_id", gamerId)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }

  async createGamerAccount(
    _parentId: string,
    input: CreateGamerInput
  ): Promise<{ gamerId: string }> {
    const response = await fetch("/api/gamers/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: input.firstName,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        minecraftUsername: input.minecraftUsername,
        robloxUsername: input.robloxUsername,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(
        data.error || "Failed to create gamer account",
        response.status,
        data.code,
      );
    }

    return { gamerId: data.gamerId };
  }

  async updateGamer(
    gamerId: string,
    updates: GamerUpdate,
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
