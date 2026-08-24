import type { AppSupabaseClient, GeduContractAcceptance } from "@/types";

/**
 * The gedu contract: reading who has signed what, and signing.
 *
 * The write is an RPC and the read is a plain table select, and that asymmetry
 * is the design rather than an accident. An acceptance row is an audit record —
 * the version, a server-stamped moment, and the signer's name as it stood at
 * that moment — so every field a client could forge is derived server-side and
 * the table carries no write grant at all. Reading is the opposite: RLS already
 * says exactly who may see a row (an admin sees anyone's, a gedu sees their
 * own), so a select needs no wrapper to be safe.
 */
export class GeduContractService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Every version this gedu has accepted, newest first.
   *
   * A bounded set — at most one row per contract version the platform has ever
   * published — read by primary-key prefix, so this lands in a frame or two and
   * wants no loading affordance beyond a container that already has its final
   * size. It is not paged for the same reason: there is no page two.
   *
   * The caller decides what "current" means and compares against it. This method
   * deliberately does not, because the current version is a property of the
   * document the app ships, not of the row set.
   */
  async getAcceptances(geduId: string): Promise<GeduContractAcceptance[]> {
    const { data, error } = await this.supabase
      .from("gedu_contract_acceptances")
      .select("gedu_id, contract_version, accepted_at, signed_name")
      .eq("gedu_id", geduId)
      .order("accepted_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /**
   * Accept one version of the contract *as the signed-in gedu*, and return the
   * moment the acceptance carries.
   *
   * There is no subject parameter, and that absence is the point: the row is
   * keyed to the caller's own uid inside the RPC, so nobody can sign on anyone
   * else's behalf. Idempotent — accepting a version already accepted returns the
   * first acceptance's timestamp and writes nothing — which is what lets a
   * double-submit, a retry or a stale tab be harmless rather than a second
   * signature.
   *
   * Throws when the version is one the platform does not know about. That is the
   * shape of a client left running across a release that published a new
   * version, and it is a refusal rather than a silent write of a meaningless
   * string.
   */
  async acceptContract(version: string): Promise<string> {
    const { data, error } = await this.supabase.rpc("accept_gedu_contract", {
      p_version: version,
    });
    if (error) throw error;
    return data;
  }
}
