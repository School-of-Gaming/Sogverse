import type { QueryData } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/types";
import { walkPages } from "@/lib/supabase/paging";

// verifier joins through the verified_by FK (disambiguated from user_id, which
// is the other FK to profiles). Nullable — an un-verified gedu, or a backfilled
// one, has no verifier.
const GEDU_PROFILE_COLUMNS =
  "user_id, verified, verified_at, verified_by, verifier:profiles!gedu_profiles_verified_by_fkey(first_name, last_name)";

/** Shared builder so the embedded-verifier row type is inferred, not hand-written. */
function geduProfilesQuery(supabase: AppSupabaseClient) {
  return supabase.from("gedu_profiles").select(GEDU_PROFILE_COLUMNS);
}

export type GeduVerification = QueryData<ReturnType<typeof geduProfilesQuery>>[number];

/**
 * Whether a gedu's account has been admin-verified.
 *
 * This is the **server-side** mod boundary for gedu-initiated actions on
 * instant voice rooms — creating a room, ending one, and being granted owner
 * (`is_owner`) power when joining one. Unlike the group-assignment gate (UI-only
 * by design, because only trusted admins assign), these are initiated by the
 * gedu themselves, so a UI gate is not enough and the check must live on the
 * server (see ./CLAUDE.md).
 *
 * Reads the gedu's own row via `.single()` — RLS lets a gedu read its own
 * `gedu_profiles` row, and every gedu has exactly one (written at registration),
 * so an absent row is a real error, not "unverified". Callers decide how to
 * treat a thrown error: fail-closed to guest (the public token route) or surface
 * a 500 (the authenticated create/end routes).
 */
export async function isGeduVerified(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("gedu_profiles")
    .select("verified")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data.verified;
}

export class GeduProfilesService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Verification state for every gedu (admin-readable).
   *
   * Walked rather than selected: the admin users list renders an "Unverified"
   * badge from the absence of a row here, so a read truncated at PostgREST's
   * `max_rows` does not omit a badge — it prints a *wrong* one on every gedu
   * that fell off the end. Ordered by the table's primary key, which is the
   * total order the walk needs.
   */
  async getAll(): Promise<GeduVerification[]> {
    return walkPages("getAllGeduProfiles", (from, to) =>
      this.supabase
        .from("gedu_profiles")
        .select(GEDU_PROFILE_COLUMNS, { count: "exact" })
        .order("user_id")
        .range(from, to),
    );
  }

  /** Verification state for a single gedu, or null if none exists. */
  async getOne(geduId: string): Promise<GeduVerification | null> {
    const { data, error } = await geduProfilesQuery(this.supabase)
      .eq("user_id", geduId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Verify or un-verify a gedu. The RPC stamps verified_at / verified_by. */
  async setVerified(geduId: string, verified: boolean): Promise<void> {
    const { error } = await this.supabase.rpc("set_gedu_verified", {
      p_gedu_id: geduId,
      p_verified: verified,
    });
    if (error) throw error;
  }
}
