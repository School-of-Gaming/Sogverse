import type { AppSupabaseClient, SubstitutionReason } from "@/types";
import {
  adminSubstitutionRequests,
  anonymousSubstitutionRequestDocument,
  substitutionRequestDocument,
  openSubstitutionRequests,
  type AdminSubstitutionRequest,
  type AnonymousSubstitutionRequestDocument,
  type SubstitutionRequestDocument,
  type OpenSubstitutionRequest,
} from "./session-substitution.contracts";

/**
 * Reads and writes for session substitutions.
 *
 * **Every method is an `.rpc()` call, and there is no API route anywhere in
 * this feature.** Both substitution tables grant `authenticated` nothing, so the
 * `SECURITY DEFINER` functions are the only way in and the authorization lives
 * in one place — guard-first in each function body — rather than being
 * re-derived per call site. That is the transport the gedu session writes
 * already use, and the admin writes here use it too: they assert the admin role
 * in the function rather than behind a route, because nothing they do needs a
 * server-side secret.
 *
 * **Refusals are left to throw.** A substitution write is always somebody pressing a
 * button, and every refusal is news they have to be told: the session was
 * substituted while the dialog was open, the offer went stale, the request is
 * already withdrawn. Swallowing one into `null` would leave a button that did
 * nothing and said nothing.
 *
 * **The two optional reason parameters are omitted, never sent as null.** The
 * type generator never types an RPC argument as nullable, so the writers carry
 * trailing `DEFAULT NULL`s and a caller with nothing to say leaves the argument
 * out of the payload entirely. Sending `null` would not compile; sending an
 * empty string would store one.
 */
export class SessionSubstitutionService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Every open request this gedu could take, ordered by date then product.
   *
   * The exclusion is the database's own *may substitute* predicate rather than a
   * copy of its clauses, so the list and the offer button can never disagree: a
   * session the caller is expected at, one they have their own request on, and
   * their own absence are all out by construction.
   */
  async getOpenRequests(): Promise<OpenSubstitutionRequest[]> {
    const { data, error } = await this.supabase.rpc("get_open_substitution_requests");
    if (error) throw error;
    return openSubstitutionRequests.parse(data);
  }

  /**
   * The admin Substitutions page: every open request with its offers, and
   * every upcoming substituted request with its substitute and approver, in
   * one array the page splits by status.
   *
   * Each offer carries the offerer's name and nothing else — an uncertified
   * gedu cannot hold one, so a certification chip would have been true by
   * construction, and the criminal-record stamp is children's-safety data a
   * page that does not act on it has no business being handed.
   */
  async getAdminQueue(): Promise<AdminSubstitutionRequest[]> {
    const { data, error } = await this.supabase.rpc(
      "get_admin_substitution_requests",
    );
    if (error) throw error;
    return adminSubstitutionRequests.parse(data);
  }

  /**
   * File "I can't make this session" for a session the caller is expected at.
   *
   * The role being substituted is resolved server-side — the caller's assignment
   * role, or the role stored on the substitution they themselves hold — so a sub
   * asking for a sub needs no extra argument.
   */
  async requestSubstitution(args: {
    groupId: string;
    sessionDate: string;
    reason: SubstitutionReason;
    reasonNote?: string;
  }): Promise<SubstitutionRequestDocument> {
    const note = args.reasonNote?.trim() ?? "";
    const { data, error } = await this.supabase.rpc("request_session_substitution", {
      p_group_id: args.groupId,
      p_session_date: args.sessionDate,
      p_reason: args.reason,
      ...(note.length > 0 ? { p_reason_note: note } : {}),
    });
    if (error) throw error;
    return substitutionRequestDocument.parse(data);
  }

  /** Take back an absence, while it is still open. */
  async withdrawRequest(requestId: string): Promise<SubstitutionRequestDocument> {
    const { data, error } = await this.supabase.rpc(
      "withdraw_session_substitution_request",
      { p_request_id: requestId },
    );
    if (error) throw error;
    return substitutionRequestDocument.parse(data);
  }

  /**
   * "Offer to substitute." Idempotent on the (request, gedu) unique key, so a
   * double-tap is one offer rather than an error.
   *
   * **Returns the anonymous document**: volunteering does not tell you whose
   * absence you volunteered for, exactly as the pool row it came from does not.
   */
  async offerSubstitution(requestId: string): Promise<AnonymousSubstitutionRequestDocument> {
    const { data, error } = await this.supabase.rpc("offer_session_substitution", {
      p_request_id: requestId,
    });
    if (error) throw error;
    return anonymousSubstitutionRequestDocument.parse(data);
  }

  /**
   * Take an offer back. Keyed on the **request**, because that is what the pool
   * row knows about — an offer id would be a second identifier for the caller's
   * one row. Refused when the caller is the approved substitute (taking back an offer
   * somebody has already staffed you on is a new absence, not an un-offer) and
   * refused when the caller holds no offer at all — a withdraw that deletes
   * nothing would be a read of somebody else's absence wearing a write's
   * clothes.
   *
   * **Returns the anonymous document**, as `offerSubstitution` does.
   */
  async withdrawOffer(
    requestId: string,
  ): Promise<AnonymousSubstitutionRequestDocument> {
    const { data, error } = await this.supabase.rpc(
      "withdraw_session_substitution_offer",
      { p_request_id: requestId },
    );
    if (error) throw error;
    return anonymousSubstitutionRequestDocument.parse(data);
  }

  /**
   * Approve one offer, making that gedu the substitution. The other offers are left
   * alone — "not selected" is derived from the request being substituted by
   * somebody else, and an offerer never learns who else offered.
   */
  async approveOffer(offerId: string): Promise<SubstitutionRequestDocument> {
    const { data, error } = await this.supabase.rpc(
      "approve_session_substitution_offer",
      { p_offer_id: offerId },
    );
    if (error) throw error;
    return substitutionRequestDocument.parse(data);
  }

  /**
   * Seat a sub outright — the office-arranged path, with no offer needed.
   *
   * It works on **past** sessions too, which is the whole reason it exists
   * beside the approval flow: an off-platform substitution that has already happened
   * has to be recordable, because gedu invoicing reads these rows. Where the
   * absent gedu already has a request, this fills it; where they have none,
   * one is filed on their behalf already substituted; where they are already
   * substituted, the substitution is re-pointed at the new sub in one action.
   *
   * Reason and note are optional here, and are only overwritten when supplied —
   * an admin replacing a sub does not blank what the absent gedu wrote.
   */
  async setSubstitution(args: {
    groupId: string;
    sessionDate: string;
    absentGeduId: string;
    subGeduId: string;
    reason?: SubstitutionReason;
    reasonNote?: string;
  }): Promise<SubstitutionRequestDocument> {
    const note = args.reasonNote?.trim() ?? "";
    const { data, error } = await this.supabase.rpc("set_session_substitution", {
      p_group_id: args.groupId,
      p_session_date: args.sessionDate,
      p_absent_gedu_id: args.absentGeduId,
      p_sub_gedu_id: args.subGeduId,
      ...(args.reason !== undefined ? { p_reason: args.reason } : {}),
      ...(note.length > 0 ? { p_reason_note: note } : {}),
    });
    if (error) throw error;
    return substitutionRequestDocument.parse(data);
  }

  /**
   * Unseat the sub: the request goes back to `open`, so the session returns to
   * the pool and to the admin queue. The offers survive — they are still people
   * who said they could come.
   */
  async clearSubstitution(requestId: string): Promise<SubstitutionRequestDocument> {
    const { data, error } = await this.supabase.rpc("clear_session_substitution", {
      p_request_id: requestId,
    });
    if (error) throw error;
    return substitutionRequestDocument.parse(data);
  }

  /**
   * "The absent gedu is attending after all." Withdraws any non-withdrawn
   * request, substituted or not, and unwinds the substitution with it rather than
   * freezing a sub onto a session nobody is absent from.
   */
  async withdrawRequestAsAdmin(
    requestId: string,
  ): Promise<SubstitutionRequestDocument> {
    const { data, error } = await this.supabase.rpc(
      "withdraw_session_substitution_request_as_admin",
      { p_request_id: requestId },
    );
    if (error) throw error;
    return substitutionRequestDocument.parse(data);
  }
}
