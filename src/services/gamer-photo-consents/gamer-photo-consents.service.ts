import type {
  AppSupabaseClient,
  GamerPhotoConsent,
  GamerPhotoConsentType,
} from "@/types";

/**
 * Whether photos and video of a child may be taken and used: what is currently
 * on file for a gamer, and the one call that changes it.
 *
 * The twin of the marketing-consent service with the subject changed from an
 * adult's mailbox to a child's image, and it carries the same asymmetry:
 * **reads are plain selects and the write is an RPC.** Row-level security
 * already says exactly who may *see* a row — the gamer's parent, the gamer
 * themselves, a gedu assigned to a group the gamer is in, and an admin — so a
 * select needs no wrapper to be safe. Writing is the opposite:
 * `gamer_photo_consents` carries no write grant for any Data API role at all,
 * the answering parent is taken from `auth.uid()` inside
 * `set_gamer_photo_consent` rather than from a parameter, and the append-only
 * event log is written in the same transaction. So there is exactly one way in.
 *
 * **The reads take no role argument, deliberately.** Four different readers ask
 * these two questions and the policy answers each of them differently; a role
 * parameter here would be a second, weaker copy of that decision, and the one
 * that drifted would be this one. A reader who may not see a row receives no
 * row, which is RLS working rather than a case to handle.
 *
 * **No API route behind the write.** The service pattern routes a write through
 * `fetch()` when it needs a server-side secret; this one needs none. The RPC is
 * `SECURITY DEFINER`, guard-first on `assert_role('customer')`, refuses unless a
 * `parent_gamer` row links the caller to the child, and is reachable by
 * `authenticated` — so the caller's own browser client is the right and only
 * client for it.
 */
export class GamerPhotoConsentsService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * One gamer's photo consents.
   *
   * **An absent row is a real answer, and here the two states collapse on
   * purpose.** At most one row comes back today; a consent type missing from
   * the result means "never asked or never answered", and every surface renders
   * that identically to a stored `granted = false` — the child stays out of the
   * photographs. That is the feature's central decision, not a caller's
   * convenience: a safeguard whose default depended on whether anyone had got
   * round to asking would not be a safeguard.
   */
  async getForGamer(gamerId: string): Promise<GamerPhotoConsent[]> {
    const { data, error } = await this.supabase
      .from("gamer_photo_consents")
      .select("gamer_id, consent_type, granted, updated_at")
      .eq("gamer_id", gamerId);

    if (error) throw error;
    return data;
  }

  /**
   * The same rows for a set of gamers — a gedu's roster, a parent's children.
   *
   * One request for the whole list rather than one per gamer, because the
   * caller that wants this wants it for everybody on a roster at once and a
   * request per row would put a session editor's photo block behind N round
   * trips. **An empty list short-circuits without a request**: `.in()` on an
   * empty array is a query that can only return nothing, so asking is pure
   * latency, and a caller with no ids yet (a roster still loading) gets an
   * answer in the same tick instead of a flicker.
   *
   * Rows come back unordered and un-grouped; a caller that needs them per gamer
   * indexes them itself, and must keep treating an id with no row as "not
   * allowed" — the absence carries the same meaning it does above, and a naive
   * `rows.length === ids.length` check would be reading the wrong thing.
   */
  async getForGamers(
    gamerIds: readonly string[],
  ): Promise<GamerPhotoConsent[]> {
    if (gamerIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("gamer_photo_consents")
      .select("gamer_id, consent_type, granted, updated_at")
      .in("gamer_id", [...gamerIds]);

    if (error) throw error;
    return data;
  }

  /**
   * Answer one photo consent for one of the signed-in parent's own children.
   *
   * The gamer id IS a parameter here, which is the one place this service
   * departs from its marketing twin: there the subject and the answerer are the
   * same person and the RPC took no id at all. Here they are two people, so the
   * id has to be named — and the RPC refuses it unless a `parent_gamer` row
   * links `auth.uid()` to that child, which is what keeps the parameter from
   * being an authorization decision made in the browser. The parent is also
   * stamped onto the event as `answered_by`: provenance the marketing twin did
   * not need.
   *
   * `source` names which surface the answer came from and is the one field on
   * the stored event that no other field can corroborate. Only two are
   * accepted — `settings` (the gamer's page under the parent's My SOG) and
   * `enrolment` — because a gamer is never created carrying this answer, so
   * there is no `registration` source to write.
   *
   * **Idempotent, and honest about it.** Submitting the state already on file
   * succeeds and appends no event, so a stale tab replaying its answer costs
   * nothing and does not turn up in the log as a change of mind. A first
   * explicit "no" over an absent row IS a change, and is logged as one.
   */
  async setConsent(
    gamerId: string,
    consentType: GamerPhotoConsentType,
    granted: boolean,
    source: "settings" | "enrolment",
  ): Promise<void> {
    const { error } = await this.supabase.rpc("set_gamer_photo_consent", {
      p_gamer_id: gamerId,
      p_consent_type: consentType,
      p_granted: granted,
      p_source: source,
    });

    if (error) throw error;
  }
}
