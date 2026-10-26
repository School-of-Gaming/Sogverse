import { defineRoute } from "@/lib/api/define-route";
import { createAdminClient } from "@/lib/supabase/admin";
import { substitutionNotificationObservation } from "@/services/session-substitution/session-substitution.contracts";

/**
 * POST /api/substitution-notifications/observe — bring the substitution
 * notifications up to the clock, because somebody is looking.
 *
 * **Two things move a request's messages without any write to notice them**,
 * and this route is where both are noticed. A request's date passes, so its
 * buttons have to close; and an outbox row comes due with nothing to kick it —
 * a kick that was lost, a sync that died holding its lease, a backoff that ran
 * out. An admin opening the Substitutions page or a gedu opening their pool of
 * open requests calls this, and it files the passed requests and kicks the sync
 * when a row is due. What it costs is latency: if nobody looks, a passed
 * request's buttons stay up and a stuck row waits, and a press on a stale
 * button is answered by the write's own refusal.
 *
 * **The kick still goes through the database.** Both functions queue the same
 * `pg_net` call a write does, from the URL and secret in Vault, so a local
 * stack and CI — which hold neither — send nothing when a page opens, exactly
 * as a write there sends nothing. Filing a request kicks once by itself, and
 * that drain takes every due row, so the separate kick is asked for only when
 * nothing was filed.
 *
 * Both are cheap and usually empty, and the answer waits for neither the
 * drain nor any message: `pg_net` sends after the call returns.
 */
export const POST = defineRoute({
  posture: "role-gated",
  roles: ["admin", "gedu"],
  forbiddenMessage: "Only admins and gedus observe substitution notifications",
  response: substitutionNotificationObservation,

  handler: async () => {
    const admin = createAdminClient();

    const closeOut = await admin.rpc("enqueue_passed_substitution_notifications");
    if (closeOut.error) throw closeOut.error;

    if (closeOut.data === 0) {
      const kick = await admin.rpc("kick_substitution_notification_sync_if_due");
      if (kick.error) throw kick.error;
    }

    return { closedOut: closeOut.data };
  },
});
