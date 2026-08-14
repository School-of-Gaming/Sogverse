import { z } from "zod";
import type { Profile, ProfileUpdate, UserRole, ParentGamer, SpokenLanguage, AppSupabaseClient } from "@/types";
import { escapeLikePattern, searchTerms } from "@/lib/utils";
import { walkPages } from "@/lib/supabase/paging";
import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import {
  adminGameAccountWriteResult,
  searchedProfile,
  SEARCHED_PROFILE_COLUMNS,
  type AdminGameAccountBody,
  type AdminGameAccountWriteResult,
} from "./users.contracts";

/** How many matches one user search returns. */
const USER_SEARCH_LIMIT = 20;

/**
 * How many digits of a phone number are matched, counting from the end.
 *
 * A Finnish number reaches us as `358401234567` (E.164 without the `+`) and
 * gets typed either way round — `+358 40 123 4567` internationally, or
 * `040 123 4567` nationally, where the trunk `0` stands in for the country
 * code. The two forms share their tail and differ in their head, so matching a
 * fixed number of trailing digits finds the row from either without the search
 * having to know a single dialling rule. Seven is the subscriber part of a
 * Finnish mobile number: long enough not to collide at any size this table will
 * reach, short enough to survive whatever prefix was typed in front of it.
 */
const PHONE_MATCH_DIGITS = 7;

/**
 * The fewest digits that make a query a phone number rather than a name.
 *
 * Below this a digit string is far likelier to be part of a game handle
 * (`EnderDragon42`) or a house number than a number somebody is dialling.
 */
const PHONE_MIN_DIGITS = 5;

/**
 * The one term a phone-shaped query becomes, or null if it is not one.
 *
 * This has to run *before* the tokenizer rather than beside it, because a phone
 * number is the one thing people type with spaces inside a single value:
 * `040 123 4567` split into words would demand a profile matching "040" and
 * "123" and "4567" separately, which is nobody. A query with no letters in it
 * is not three terms, it is one number typed with its groups spaced out.
 */
function phoneTerm(query: string): string | null {
  if (/\p{L}/u.test(query)) return null;

  const digits = query.replace(/\D/g, "");
  if (digits.length < PHONE_MIN_DIGITS) return null;

  return digits.slice(-PHONE_MATCH_DIGITS);
}

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
   * Mail the caller's own address a fresh verification link.
   *
   * Takes no argument and can name no recipient: the route reads the target off
   * the session, which is what makes a button anyone can press harmless. A
   * failure is thrown so the settings card can say so — unlike the enumeration-
   * defended password-reset path, there is nothing to hide here, because the
   * caller is asking us to write to an address they are already signed in as.
   */
  async sendVerificationEmail(): Promise<void> {
    const response = await fetch("/api/auth/verify-email/send", {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to send the verification email"),
      );
    }
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
   * Runs against `user_search_index` rather than `profiles`, which is what puts
   * a phone number and a game handle within reach: the view carries one
   * `search_blob` per person holding every string they can be found by, so an
   * admin working from a WhatsApp message or a gedu's "who is EnderDragon42?"
   * asks the same question as one working from a name. A platform added later
   * changes the view and nothing here.
   *
   * Capped rather than walked on purpose: this runs on every keystroke and a
   * two-letter needle matches half the table. The count is the price of
   * capping — it costs one extra aggregate and it is what stops the cap being
   * invisible to whoever is searching.
   */
  async searchUsers(query: string): Promise<UserSearchResult> {
    // A phone number is one value typed with spaces inside it, so it has to be
    // recognised before the tokenizer gets to split it into three useless
    // fragments. Everything else is words.
    const phone = phoneTerm(query);
    const terms = phone ? [phone] : searchTerms(query);

    // Nothing searchable was typed — punctuation alone, say. Answering it with
    // an unfiltered read would hand back the twenty newest accounts as if they
    // had matched something.
    if (terms.length === 0) return { results: [], total: 0 };

    let search = this.supabase
      .from("user_search_index")
      .select(SEARCHED_PROFILE_COLUMNS, { count: "exact" });

    // One filter per term, and PostgREST ANDs repeated filters — so "jon smith"
    // asks for somebody whose blob contains "jon" *and* "smith", in either
    // order and across any of the fields the view folded into it. That is what
    // makes adding the surname narrow the results rather than change the
    // question, which is the whole bug this started as.
    for (const term of terms) {
      search = search.ilike("search_blob", `%${escapeLikePattern(term)}%`);
    }

    const { data, error, count } = await search
      .order("created_at", { ascending: false })
      .order("id")
      .limit(USER_SEARCH_LIMIT);

    if (error) throw error;

    // The view cannot promise NOT NULL through PostgreSQL's catalog, so the
    // generated row type is nullable everywhere and the parse is what puts the
    // guarantee back — loudly, if the view's shape ever stops matching.
    return {
      results: z.array(searchedProfile).parse(data),
      // `count` is only absent if `count: "exact"` were dropped above; falling
      // back to what arrived keeps the shape total rather than making it lie.
      total: count ?? data.length,
    };
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
