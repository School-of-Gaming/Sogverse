import type { QueryData } from "@supabase/supabase-js";
import { Constants, type AppSupabaseClient, type GeduQualification } from "@/types";

export type { GeduQualification };

/**
 * Every qualification, in the order the `gedu_qualification` enum declares
 * them — the order a surface lists them in, held and not held alike, so no
 * call site sorts. Derived from codegen, so a qualification added by migration
 * appears here with no edit.
 */
export const GEDU_QUALIFICATIONS: readonly GeduQualification[] =
  Constants.public.Enums.gedu_qualification;

/**
 * The granting admin joins through the `granted_by` FK. It reads back null in
 * two cases: the admin's account is gone (`ON DELETE SET NULL`), or the reader
 * is the gedu themselves, whose RLS does not reach another account's profile.
 */
const GEDU_QUALIFICATION_COLUMNS =
  "qualification, granted_at, granter:profiles!gedu_qualifications_granted_by_fkey(first_name, last_name)";

/** Shared builder so the embedded row type is inferred rather than hand-written. */
function geduQualificationsQuery(supabase: AppSupabaseClient) {
  return supabase.from("gedu_qualifications").select(GEDU_QUALIFICATION_COLUMNS);
}

/** One qualification a gedu holds: which, when it was granted, and by whom. */
export type HeldGeduQualification = QueryData<
  ReturnType<typeof geduQualificationsQuery>
>[number];

export class GeduQualificationsService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * The qualifications one gedu holds — a row per qualification held, none for
   * one not held. An admin may read anyone's; a gedu reads only their own (RLS
   * answers any other id with no rows).
   */
  async getForGedu(geduId: string): Promise<HeldGeduQualification[]> {
    const { data, error } = await geduQualificationsQuery(this.supabase).eq(
      "gedu_id",
      geduId,
    );
    if (error) throw error;
    return data;
  }

  /**
   * Grant (`held` true) or revoke (`held` false) one qualification. The RPC
   * stamps the moment and the acting admin; granting one already held keeps
   * the original stamp, and revoking deletes the row.
   */
  async setQualification(
    geduId: string,
    qualification: GeduQualification,
    held: boolean,
  ): Promise<void> {
    const { error } = await this.supabase.rpc("set_gedu_qualification", {
      p_gedu_id: geduId,
      p_qualification: qualification,
      p_held: held,
    });
    if (error) throw error;
  }
}
