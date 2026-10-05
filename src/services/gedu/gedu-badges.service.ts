import type { QueryData } from "@supabase/supabase-js";
import { Constants, type AppSupabaseClient, type GeduBadge } from "@/types";

export type { GeduBadge };

/**
 * Every badge, in the order the `gedu_badge` enum declares them — the order a
 * surface lists them in, earned and unearned alike, so no call site sorts.
 * Derived from codegen, so a badge added by migration appears here with no edit.
 */
export const GEDU_BADGES: readonly GeduBadge[] = Constants.public.Enums.gedu_badge;

/**
 * The granting admin joins through the `granted_by` FK. It reads back null in
 * two cases: the admin's account is gone (`ON DELETE SET NULL`), or the reader
 * is the gedu themselves, whose RLS does not reach another account's profile.
 */
const GEDU_BADGE_COLUMNS =
  "badge, granted_at, granter:profiles!gedu_badges_granted_by_fkey(first_name, last_name)";

/** Shared builder so the embedded row type is inferred rather than hand-written. */
function geduBadgesQuery(supabase: AppSupabaseClient) {
  return supabase.from("gedu_badges").select(GEDU_BADGE_COLUMNS);
}

/** One badge a gedu holds: which, when it was granted, and by whom. */
export type HeldGeduBadge = QueryData<ReturnType<typeof geduBadgesQuery>>[number];

export class GeduBadgesService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * The badges one gedu holds — a row per badge held, none for one not held.
   * An admin may read anyone's; a gedu reads only their own (RLS answers any
   * other id with no rows).
   */
  async getForGedu(geduId: string): Promise<HeldGeduBadge[]> {
    const { data, error } = await geduBadgesQuery(this.supabase).eq(
      "gedu_id",
      geduId,
    );
    if (error) throw error;
    return data;
  }

  /**
   * Grant (`held` true) or revoke (`held` false) one badge. The RPC stamps the
   * moment and the acting admin; granting a badge already held keeps the
   * original stamp, and revoking deletes the row.
   */
  async setBadge(geduId: string, badge: GeduBadge, held: boolean): Promise<void> {
    const { error } = await this.supabase.rpc("set_gedu_badge", {
      p_gedu_id: geduId,
      p_badge: badge,
      p_held: held,
    });
    if (error) throw error;
  }
}
