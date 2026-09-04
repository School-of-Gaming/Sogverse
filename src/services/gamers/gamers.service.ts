import type {
  Profile,
  ParentGamer,
  CreateGamerInput,
  GamerProfile,
  GamerSignIn,
  GenderType,
  AppSupabaseClient,
} from "@/types";
import { isGamerProfile } from "@/types";
import { ApiError } from "@/lib/api/api-error";
import { readErrorMessage } from "@/lib/api/json-response";
import { chunkKeys } from "@/lib/supabase/paging";

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
  /**
   * A new password for the child. Accepted only while the account is (or is
   * becoming) in `username` mode — the route answers 400 otherwise, because a
   * password on a switch-only or email-mode account is a credential with
   * nothing to type it against.
   */
  password?: string;
  minecraftUsername?: string | null;
  robloxUsername?: string | null;
  /** Move the child to a different sign-in mode. Absent leaves the mode alone. */
  signIn?: GamerSignIn;
  /** A new username, which also becomes the account's synthetic address. */
  username?: string;
  /**
   * The real address a child is *entering* `email` mode with, which they then
   * have to verify. An account already in that mode does not take a new one —
   * the route answers 400, because changing an account's address is not
   * something the platform supports for any role.
   */
  email?: string;
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
   * The sign-in mode of each named gamer, as `{ user_id, sign_in }` rows.
   *
   * For the admin users list, which prints a different identity line per mode —
   * a mailbox, a username, or nothing at all — and cannot ask per row without
   * turning one list into a query per child. One read alongside the profiles
   * read it is already doing answers the whole page.
   *
   * **Keyed, not walked, and the ids come from the page.** The caller is
   * already holding the users it is about to render — a page of them, or a
   * search result — so asking about every gamer on the platform to print a line
   * beside a couple of dozen is a read whose cost grows with the table while
   * the page it feeds does not. Keyed also removes the truncation trap that
   * made the walk necessary: `gamer_profiles` is one row per user, so a chunk
   * asking for N ids can come back with at most N rows, and
   * `KEY_LOOKUP_CHUNK_SIZE` is comfortably under `max_rows` — a short page here
   * means the id had no row, which is exactly the answer the list wants.
   *
   * Ids that are not gamers cost nothing: this is a lookup, and a missing row
   * is simply absent from the map the caller builds.
   *
   * Admin RLS (`admin_full_access_gamer_profiles`) is what permits the
   * cross-user read; a parent calling this gets only their own children, which
   * is correct rather than a limitation.
   */
  async getGamerSignIns(
    userIds: readonly string[],
  ): Promise<Pick<GamerProfile, "user_id" | "sign_in">[]> {
    if (userIds.length === 0) return [];

    const rows: Pick<GamerProfile, "user_id" | "sign_in">[] = [];
    for (const batch of chunkKeys(userIds)) {
      const { data, error } = await this.supabase
        .from("gamer_profiles")
        .select("user_id,sign_in")
        .in("user_id", batch);

      if (error) throw error;
      rows.push(...data);
    }
    return rows;
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
   * it: the editor's month select is clamped against the year beside it, so the
   * UI cannot compose a future date in the first place, and the CHECK is there
   * to fail loudly rather than store one if anything else ever tries.
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
        // Named one at a time rather than spread, so a field the route does not
        // take cannot arrive by accident. The credential trio is only ever the
        // one its mode calls for; the route re-checks that pairing anyway.
        signIn: input.signIn,
        username: input.username,
        email: input.email,
        password: input.password,
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
      // Carries the code through, so a form can tell "that username is taken"
      // from every other refusal and put the message on the right field.
      throw new ApiError(
        data.error || "Failed to update gamer",
        response.status,
        data.code,
      );
    }

    return data.gamer;
  }

  /**
   * Ask us to re-send the verification mail to one of this parent's children.
   *
   * A child in `email` mode cannot ask for themselves — they have no password
   * until the address is verified — so the request is the parent's, about a
   * named child. The send is the outcome here rather than a follow-on, so a
   * failure is surfaced rather than swallowed.
   */
  async sendGamerVerificationEmail(gamerId: string): Promise<void> {
    const response = await fetch(`/api/gamers/${gamerId}/verification/send`, {
      method: "POST",
    });
    if (!response.ok) {
      throw new ApiError(
        await readErrorMessage(response, "Failed to send the verification email"),
        response.status,
        undefined,
      );
    }
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
