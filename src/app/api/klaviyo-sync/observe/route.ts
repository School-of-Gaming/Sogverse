import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { klaviyoSyncObservation } from "@/services/klaviyo-sync/klaviyo-sync.contracts";

/**
 * POST /api/klaviyo-sync/observe — catch the Klaviyo sync up, because an admin
 * is looking, and say whether anything is stuck.
 *
 * **A row can come due with nothing to kick it** — a kick that was lost, a
 * sync that died holding its lease, a backoff that ran out — and nothing runs
 * on a clock to notice. An admin opening the Users list calls this, and it
 * kicks the sync when a row in either outbox is due. The kick goes through the
 * same Vault-gated `pg_net` call a write makes, so a local stack and CI, which
 * hold no secrets, send nothing.
 *
 * **It also answers how many rows are parked**, which is the one sign the sync
 * has stopped for somebody: the page shows a quiet line when any are.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["admin"],
  forbiddenMessage: "Only admins observe the Klaviyo sync",
  response: klaviyoSyncObservation,

  handler: async () => {
    const admin = createAdminClient();

    const kick = await admin.rpc("kick_klaviyo_sync_if_due");
    if (kick.error) throw kick.error;

    const [profiles, events] = await Promise.all([
      admin
        .from("klaviyo_profile_outbox")
        .select("customer_id", { count: "exact", head: true })
        .eq("next_attempt_at", "infinity"),
      admin
        .from("klaviyo_event_outbox")
        .select("event_id", { count: "exact", head: true })
        .eq("next_attempt_at", "infinity"),
    ]);
    if (profiles.error) throw profiles.error;
    if (events.error) throw events.error;
    // An exact count is always a number on success; the type is looser than that.
    if (profiles.count === null || events.count === null) {
      throw new Error("An exact count came back without a number");
    }

    return { parkedProfiles: profiles.count, parkedEvents: events.count };
  },
});
