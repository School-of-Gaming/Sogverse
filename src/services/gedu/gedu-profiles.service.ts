import type { QueryData } from "@supabase/supabase-js";
import type { AppSupabaseClient } from "@/types";

/** Shared builder so the embedded-verifier row type is inferred, not hand-written. */
function geduProfilesQuery(supabase: AppSupabaseClient) {
  return supabase
    .from("gedu_profiles")
    .select(
      // verifier joins through the verified_by FK (disambiguated from user_id,
      // which is the other FK to profiles). Nullable — an un-verified gedu, or a
      // backfilled one, has no verifier.
      "user_id, verified, verified_at, verified_by, verifier:profiles!gedu_profiles_verified_by_fkey(first_name, last_name)",
    );
}

export type GeduVerification = QueryData<ReturnType<typeof geduProfilesQuery>>[number];

export class GeduProfilesService {
  constructor(private supabase: AppSupabaseClient) {}

  /** Verification state for every gedu (admin-readable). */
  async getAll(): Promise<GeduVerification[]> {
    const { data, error } = await geduProfilesQuery(this.supabase);
    if (error) throw error;
    return data;
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
