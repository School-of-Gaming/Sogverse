import type { QueryData } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/types";
import { walkPages } from "@/lib/supabase/paging";

// certifier joins through the certified_by FK (disambiguated from user_id, which
// is the other FK to profiles). Nullable — an un-certified gedu, or a backfilled
// one, has no certifier.
const GEDU_PROFILE_COLUMNS =
  "user_id, certified, certified_at, certified_by, certifier:profiles!gedu_profiles_certified_by_fkey(first_name, last_name)";

/** Shared builder so the embedded-certifier row type is inferred, not hand-written. */
function geduProfilesQuery(supabase: AppSupabaseClient) {
  return supabase.from("gedu_profiles").select(GEDU_PROFILE_COLUMNS);
}

export type GeduCertification = QueryData<ReturnType<typeof geduProfilesQuery>>[number];

/**
 * Whether a gedu's account has been admin-certified.
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
 * so an absent row is a real error, not "uncertified". Callers decide how to
 * treat a thrown error: fail-closed to guest (the public token route) or surface
 * a 500 (the authenticated create/end routes).
 */
export async function isGeduCertified(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("gedu_profiles")
    .select("certified")
    .eq("user_id", userId)
    .single();
  if (error) throw error;
  return data.certified;
}

export class GeduProfilesService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Certification state for every gedu (admin-readable).
   *
   * Walked rather than selected: the admin users list marks a gedu as certified
   * from the presence of a certified row here, so a read truncated at
   * PostgREST's `max_rows` silently *drops* the mark from every certified gedu
   * that fell off the end — they render identically to an educator nobody has
   * approved, with nothing on screen to say the answer was cut short. Ordered by
   * the table's primary key, which is the total order the walk needs.
   */
  async getAll(): Promise<GeduCertification[]> {
    return walkPages("getAllGeduProfiles", (from, to) =>
      this.supabase
        .from("gedu_profiles")
        .select(GEDU_PROFILE_COLUMNS, { count: "exact" })
        .order("user_id")
        .range(from, to),
    );
  }

  /** Certification state for a single gedu, or null if none exists. */
  async getOne(geduId: string): Promise<GeduCertification | null> {
    const { data, error } = await geduProfilesQuery(this.supabase)
      .eq("user_id", geduId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Certify or de-certify a gedu. The RPC stamps certified_at / certified_by. */
  async setCertified(geduId: string, certified: boolean): Promise<void> {
    const { error } = await this.supabase.rpc("set_gedu_certified", {
      p_gedu_id: geduId,
      p_certified: certified,
    });
    if (error) throw error;
  }
}
