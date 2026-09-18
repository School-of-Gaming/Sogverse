import { z } from "zod";
import type { Profile, ProfileUpdate, UserRole, AppSupabaseClient } from "@/types";
import { escapeLikePattern, searchTerms } from "@/lib/utils";
import { walkPages } from "@/lib/supabase/paging";
import { keysetPage, type KeysetCursor } from "@/lib/supabase/keyset";
import { ADMIN_PEOPLE_LIST_PAGE_SIZE } from "@/lib/constants/admin-people-lists";
import type { SpokenLanguageCode } from "@/lib/constants/spoken-languages";
import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import {
  adminGameAccountWriteResult,
  userListEntry,
  USER_LIST_ENTRY_COLUMNS,
  USER_LIST_SEARCH_MIN_QUERY,
  type AdminGameAccountBody,
  type AdminGameAccountWriteResult,
  type UserListEntry,
} from "./users.contracts";

/**
 * What one verification-email send resolved to.
 *
 * `"rate_limited"` is a returned outcome rather than a thrown error because it
 * is an ordinary result of pressing the button — the caller asked more than six
 * times in an hour, and the database refused on behalf of the shared mail quota
 * — whereas a 500, a dropped connection or a malformed body are genuinely
 * exceptional and still throw. Discriminating on the HTTP status rather than on
 * the error text is what keeps the wording client-side: the route's English
 * sentence is a log line, never something a family reads.
 */
export type VerificationEmailSendOutcome = "sent" | "rate_limited";

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
 * The terms a needle becomes, or `null` when there is no needle to speak of.
 *
 * Three answers, not two, and the third is the one worth naming: `null` means
 * the box is *listing* rather than searching, so the read applies no text
 * filter at all; an **empty array** means something was typed that cannot match
 * anybody — punctuation alone — and the caller answers it with no rows rather
 * than with an unfiltered page pretending to be matches.
 */
function searchFilterTerms(needle: string): string[] | null {
  if (needle.length < USER_LIST_SEARCH_MIN_QUERY) return null;

  // A phone number is one value typed with spaces inside it, so it has to be
  // recognised before the tokenizer gets to split it into three useless
  // fragments. Everything else is words.
  const phone = phoneTerm(needle);
  return phone ? [phone] : searchTerms(needle);
}

/**
 * Which people one page of an admin list is about.
 *
 * Every field narrows the same query rather than choosing between queries: a
 * search, a role and a spoken language are three independent PostgREST
 * parameters the database ANDs, which is what lets the list and the search be
 * one read instead of two surfaces' worth of agreeing-by-habit code.
 */
export interface UserListFilters {
  /** What the admin typed. Trimmed by the caller; empty is "no search". */
  search: string;
  /** One role, or null for every role. */
  role: UserRole | null;
  /** A language the person must speak, or null for any. */
  spokenLanguage: SpokenLanguageCode | null;
}

/** One keyset page of the admin people list. */
export interface UserListPage {
  /** The page's rows, newest first. */
  rows: UserListEntry[];
  /**
   * How many entries match the filters — **on the first page only**, `null`
   * after it.
   *
   * The count is an aggregate over the whole match set, so asking for it on
   * every page would pay for it per page to learn a number that cannot have
   * changed. `null` therefore means "not asked", never "none": a surface
   * printing a count reads it off the first page and says nothing until that
   * page has landed.
   */
  total: number | null;
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
   *
   * The one non-failure that is also not a send is the per-hour limit, which
   * comes back as an outcome rather than an exception — see the type above.
   */
  async sendVerificationEmail(): Promise<VerificationEmailSendOutcome> {
    const response = await fetch("/api/auth/verify-email/send", {
      method: "POST",
    });

    // Read before `response.ok`, because a 429 is not a failure to report — it
    // is the limit doing its job, and the caller needs to be told a different
    // thing about it.
    if (response.status === 429) return "rate_limited";

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to send the verification email"),
      );
    }

    return "sent";
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
   * One keyset page of the admin people list, filtered as the surface asked.
   *
   * **The one read behind three surfaces** — the users page, the participant
   * picker and the gedu picker — and the reason each of them is a screenful
   * rather than a table. What it replaces is a whole-table walk of `profiles`
   * plus a whole-table walk of `parent_gamer` plus a per-gedu certification
   * read, with the family nesting, the role filter and the needle matching all
   * done in the browser afterwards; past 3,000 profiles that was four
   * sequential pages and about 1.2 MB before a single row could paint.
   *
   * **Listing and searching are the same query**, which is the whole point: the
   * view carries a family-wide search blob, so a hit on a child's name returns
   * the row that child is *inside* rather than one the surface then has to
   * collapse away, and every filter below is an ordinary PostgREST parameter
   * the database ANDs with the rest.
   *
   * `keysetPage` owns the order, the resume filter and the limit together, and
   * it owns the query's only top-level `or` — which is exactly why every filter
   * here is an `eq`, an `ilike` or a `contains` rather than a second `or`.
   */
  async getUserListPage(
    filters: UserListFilters,
    {
      cursor,
      withTotal = false,
    }: { cursor?: KeysetCursor; withTotal?: boolean } = {},
  ): Promise<UserListPage> {
    const needle = filters.search.trim();
    const terms = searchFilterTerms(needle);

    // Something unsearchable was typed. Answering it with an unfiltered read
    // would hand back the newest page as if it had matched something.
    if (terms !== null && terms.length === 0) return { rows: [], total: 0 };

    let query = this.supabase.from("user_list_entries").select(
      USER_LIST_ENTRY_COLUMNS,
      // Only a surface that renders the number asks, and only on the first
      // page. The count is an aggregate over the whole match set: it cannot
      // change as the reader scrolls, and under a search it is a second pass
      // evaluating the family blob for every row in the table — the expensive
      // half of the read, spent on nothing where no count line shows it.
      withTotal && cursor === undefined ? { count: "exact" } : undefined,
    );

    if (filters.role !== null) query = query.eq("role", filters.role);
    if (filters.spokenLanguage !== null) {
      query = query.contains("spoken_languages", [filters.spokenLanguage]);
    }

    // One filter per term, and PostgREST ANDs repeated filters — so "jon smith"
    // asks for a family whose blob contains "jon" *and* "smith", in either
    // order and across any of the strings the view folded into it. That is what
    // makes adding the surname narrow the results rather than change the
    // question.
    for (const term of terms ?? []) {
      query = query.ilike("family_search_blob", `%${escapeLikePattern(term)}%`);
    }

    const { data, error, count } = await keysetPage(query, {
      cursor,
      pageSize: ADMIN_PEOPLE_LIST_PAGE_SIZE,
    });

    if (error) throw error;

    // The view cannot promise NOT NULL through PostgreSQL's catalog, and a
    // `jsonb` column tells the compiler nothing at all, so the parse is what
    // puts both guarantees back — loudly, if the view's shape ever stops
    // matching.
    return {
      rows: z.array(userListEntry).parse(data),
      total: withTotal && cursor === undefined ? count : null,
    };
  }

  /**
   * One role's profiles, newest first.
   *
   * A paged walk rather than a plain select: `profiles` only grows — parents,
   * gamers and gedus all live there and nothing deletes them — so past
   * PostgREST's `max_rows` an unbounded read silently drops the *oldest*
   * accounts.
   *
   * `created_at` alone is not a total order — two accounts written in the same
   * transaction tie — and a page boundary under a partial order both duplicates
   * and drops rows, hence the `id` tiebreaker.
   */
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

}
