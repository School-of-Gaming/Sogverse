import { NextResponse, after } from "next/server";
import { drainKlaviyoSync } from "@/lib/klaviyo-sync/sync.server";
import { verifyKlaviyoSyncRequest } from "@/lib/klaviyo-sync/sync-auth.server";

/** The drain's own budget is 45 seconds; the function gets the minute. */
export const maxDuration = 60;

/**
 * POST /api/klaviyo-sync/sync — drain the Klaviyo outboxes.
 *
 * Called by the database's `pg_net`, when a write enqueues a parent or an
 * event and when the observation route finds a row due, with the
 * environment's shared secret as a bearer token. It takes no input: what to
 * sync is whatever the outboxes hold. The answer is 202 at once and the drain
 * runs after it, because `pg_net` waits three seconds at most and a drain can
 * take far longer; a caller learns nothing about how the drain went, and a
 * failed row is retried from the outbox.
 */
export async function POST(request: Request) {
  if (!verifyKlaviyoSyncRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  after(drain());
  return NextResponse.json({ accepted: true }, { status: 202 });
}

async function drain(): Promise<void> {
  try {
    const result = await drainKlaviyoSync();
    if (result.failed > 0 || result.outOfTime) {
      console.warn("Klaviyo sync drain:", result);
    }
  } catch (error) {
    console.error("Klaviyo sync drain failed:", error);
  }
}
