import type { AppSupabaseClient, GeduContractAcceptance } from "@/types";
import { walkPages } from "@/lib/supabase/paging";

const GEDU_CONTRACT_ACCEPTANCE_COLUMNS =
  "gedu_id, contract_version, accepted_at, signed_name";

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
   * document the app ships, not of the row set. A stored version carries the
   * language of the text that was signed (`<base>/<language>`), and the callers
   * that ask about standing compare the base — the languages of one version are
   * one agreement — while the ones that display a signature show the whole
   * string.
   */
  async getAcceptances(geduId: string): Promise<GeduContractAcceptance[]> {
    const { data, error } = await this.supabase
      .from("gedu_contract_acceptances")
      .select(GEDU_CONTRACT_ACCEPTANCE_COLUMNS)
      .eq("gedu_id", geduId)
      .order("accepted_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  /**
   * Every acceptance on the platform, for the admin surfaces that ask about a
   * *list* of educators rather than one — the users list, which marks the gedus
   * standing outside the terms in force.
   *
   * **Walked, not selected.** The one-gedu read above is bounded by
   * construction — at most one row per version ever published — and this is the
   * opposite: one row per educator per version, a set that only grows. A read
   * truncated at PostgREST's `max_rows` would come back looking complete and
   * silently drop the acceptance of every educator past the cut, which on the
   * users list renders as a warning mark on somebody who signed years ago. The
   * order is the table's own primary key, which is the total order the walk
   * needs.
   *
   * RLS is what makes one method serve one caller: an admin sees every row and
   * a gedu sees only their own, so this is admin-only in effect without saying
   * so anywhere.
   */
  async getAllAcceptances(): Promise<GeduContractAcceptance[]> {
    return walkPages("getAllGeduContractAcceptances", (from, to) =>
      this.supabase
        .from("gedu_contract_acceptances")
        .select(GEDU_CONTRACT_ACCEPTANCE_COLUMNS, { count: "exact" })
        .order("gedu_id")
        .order("contract_version")
        .range(from, to),
    );
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
   * The version is the full encoded string — `<base>/<language>`, naming which
   * of the version's equally binding texts was actually on screen — and this
   * method only forwards it: the whitelist the RPC checks against holds exactly
   * those strings, so a caller that assembled one any other way is caught there
   * rather than here.
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
