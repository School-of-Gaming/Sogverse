import { NextResponse, after } from "next/server";
import { drainSubstitutionNotifications } from "@/lib/substitution-notifications/sync.server";
import { verifySubstitutionSyncRequest } from "@/lib/substitution-notifications/sync-auth.server";

/** The drain's own budget is 50 seconds; the function gets the minute. */
export const maxDuration = 60;

/**
 * POST /api/substitution-notifications/sync — drain the substitution
 * notification outbox.
 *
 * Called by the database (`pg_net` when a write enqueues a request, the
 * `pg_cron` retry when a row comes due) and by the local drain script, each
 * with the environment's shared secret as a bearer token. It takes no input:
 * what to sync is whatever the outbox holds. The answer is 202 at once and the
 * drain runs after it, because `pg_net` waits three seconds at most and a
 * drain can take far longer; a caller learns nothing about how the drain went,
 * and a failed request is retried from its outbox row.
 */
export async function POST(request: Request) {
  if (!verifySubstitutionSyncRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  after(drain());
  return NextResponse.json({ accepted: true }, { status: 202 });
}

async function drain(): Promise<void> {
  try {
    const result = await drainSubstitutionNotifications();
    if (result.failed > 0 || result.outOfTime) {
      console.warn("Substitution notification drain:", result);
    }
  } catch (error) {
    console.error("Substitution notification drain failed:", error);
  }
}
