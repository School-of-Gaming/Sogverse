import type {
  AppSupabaseClient,
  MarketingConsent,
  MarketingConsentType,
} from "@/types";

/**
 * A parent's revocable marketing consents: what they currently say, and the one
 * call that changes it.
 *
 * **Reads are plain selects and the write is an RPC**, which is the same
 * asymmetry the gedu contract carries one system over and for the same reason.
 * Row-level security already says exactly who may *see* a row — a customer sees
 * their own, an admin sees anyone's — so a select needs no wrapper to be safe.
 * Writing is the opposite: `marketing_consents` carries no write grant for any
 * Data API role at all, the customer is taken from `auth.uid()` inside
 * `set_marketing_consent` rather than from a parameter, and the append-only
 * event log is written in the same transaction. So there is exactly one way in.
 *
 * **No API route behind the write, and that is deliberate rather than an
 * omission.** The service pattern routes a write through `fetch()` when it needs
 * a server-side secret (Stripe, Daily.co, the admin client); this one needs
 * none. The RPC is `SECURITY DEFINER`, guard-first on `assert_role('customer')`,
 * and reachable by `authenticated`, so the caller's own browser client is the
 * right and only client for it — a route in front of it would add a hop and a
 * second place for the source string to be decided.
 */
export class MarketingConsentsService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * The signed-in parent's own consents.
   *
   * No filter and no id: `customers_read_own_marketing_consents` scopes this to
   * the caller, and passing a customer id would be a parameter the database
   * ignores — which is worse than not having one, because it reads like it
   * decides something.
   *
   * **An absent row is a real answer.** At most two rows come back, and a
   * consent type missing from the result means "never asked or never answered",
   * which is not the same state as a stored `granted = false`. Both mean "do not
   * mail"; only one of them is a decision the parent made. Callers that only
   * need the current answer may collapse the two, and callers that care about
   * provenance must not.
   */
  async getMyConsents(): Promise<MarketingConsent[]> {
    const { data, error } = await this.supabase
      .from("marketing_consents")
      .select("customer_id, consent_type, granted, updated_at");

    if (error) throw error;
    return data;
  }

  /**
   * One customer's consents, for an admin looking at their detail page.
   *
   * The same query shape as the read above with the filter written out, because
   * here the id genuinely decides the answer: `admins_read_marketing_consents`
   * is what widens the policy to anyone's rows, and without the filter an admin
   * would receive the whole table.
   */
  async getConsentsForCustomer(
    customerId: string,
  ): Promise<MarketingConsent[]> {
    const { data, error } = await this.supabase
      .from("marketing_consents")
      .select("customer_id, consent_type, granted, updated_at")
      .eq("customer_id", customerId);

    if (error) throw error;
    return data;
  }

  /**
   * Set one of the signed-in parent's own consents.
   *
   * There is no subject parameter — the RPC keys the row to `auth.uid()`, so
   * nobody can answer on anyone else's behalf. `source` names which surface the
   * answer came from and is the one field on the stored event that no other
   * field can corroborate, which is why the RPC accepts only the two sources a
   * signed-in caller can legitimately be on: `settings` and `enrolment`.
   * `registration` is written by the register route's service-role client and is
   * refused here, so it is not in this method's type either.
   *
   * **Idempotent, and honest about it.** Submitting the state already on file
   * succeeds and appends no event — a stale tab replaying its answer costs
   * nothing and does not turn up in the log as a change of mind.
   */
  async setMyConsent(
    consentType: MarketingConsentType,
    granted: boolean,
    source: "settings" | "enrolment",
  ): Promise<void> {
    const { error } = await this.supabase.rpc("set_marketing_consent", {
      p_consent_type: consentType,
      p_granted: granted,
      p_source: source,
    });

    if (error) throw error;
  }
}
