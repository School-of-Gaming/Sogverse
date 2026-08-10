import type { Profile, ProfileUpdate, UserRole, ParentGamer, SpokenLanguage, AppSupabaseClient } from "@/types";
import { escapeLikePattern } from "@/lib/utils";
import { walkPages } from "@/lib/supabase/paging";
import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import {
  adminGameAccountWriteResult,
  type AdminGameAccountBody,
  type AdminGameAccountWriteResult,
} from "./users.contracts";

/** How many matches one user search returns. */
const USER_SEARCH_LIMIT = 20;

/**
 * A capped page of search matches, plus how many there really were.
 *
 * The total is what lets a surface tell a complete answer from a capped one.
 * Without it a search returning exactly the cap looks identical to a search
 * that found exactly that many people, and an admin has no way to know the
 * account they are looking for was cut off the end.
 */
export interface UserSearchResult {
  /** The capped page of matches, newest first. */
  results: Profile[];
  /** How many profiles matched in total, before the cap. */
  total: number;
}

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

  /**
   * Every profile, newest first.
   *
   * A paged walk rather than a plain select: `profiles` only grows — parents,
   * gamers and gedus all live there and nothing deletes them — so past
   * PostgREST's `max_rows` an unbounded read silently drops the *oldest*
   * accounts. That does not merely shorten the admin users list; the page
   * builds its parent↔gamer nesting from this array, so a truncated read
   * un-links whole families and makes them vanish from search results too.
   *
   * `created_at` alone is not a total order — two accounts written in the same
   * transaction tie — and a page boundary under a partial order both duplicates
   * and drops rows, hence the `id` tiebreaker.
   */
  async getAllUsers(): Promise<Profile[]> {
    return walkPages("getAllUsers", (from, to) =>
      this.supabase
        .from("profiles")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
  }

  /** One role's profiles, newest first. Paged for the same reason as above. */
  async getUsersByRole(role: UserRole): Promise<Profile[]> {
    return walkPages("getUsersByRole", (from, to) =>
      this.supabase
        .from("profiles")
        .select("*", { count: "exact" })
        .eq("role", role)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    );
  }

  /**
   * The newest profiles matching a needle, capped, with the true match count.
   *
   * Capped rather than walked on purpose: this runs on every keystroke and a
   * two-letter needle matches half the table. The count is the price of
   * capping — it costs one extra aggregate and it is what stops the cap being
   * invisible to whoever is searching.
   */
  async searchUsers(query: string): Promise<UserSearchResult> {
    const needle = escapeLikePattern(query);
    const { data, error, count } = await this.supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .or(`email.ilike.%${needle}%,first_name.ilike.%${needle}%,last_name.ilike.%${needle}%`)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(USER_SEARCH_LIMIT);

    if (error) throw error;
    // `count` is only absent if `count: "exact"` were dropped above; falling
    // back to what arrived keeps the shape total rather than making it lie.
    return { results: data, total: count ?? data.length };
  }

  /**
   * Every parent↔gamer link. Walked for the same reason as the profile reads —
   * the admin users list nests families through this array, so a truncated read
   * silently unlinks whoever fell off the end.
   *
   * Ordered by the surrogate primary key. No surface cares about the order, but
   * a paged walk needs a *total* one, and `id` is the only column here that is
   * unique on its own.
   */
  async getAllParentGamerLinks(): Promise<ParentGamer[]> {
    return walkPages("getAllParentGamerLinks", (from, to) =>
      this.supabase
        .from("parent_gamer")
        .select("*", { count: "exact" })
        .order("id")
        .range(from, to),
    );
  }
}
