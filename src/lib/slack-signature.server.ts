import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * **Slack's request signature** — the whole authorization of a request to the
 * Slack app's endpoint, which carries no session.
 *
 * Slack signs `v0:<timestamp>:<raw body>` with the app's signing secret
 * (HMAC-SHA256) and sends `v0=<hex digest>` in `X-Slack-Signature` beside the
 * timestamp in `X-Slack-Request-Timestamp`. The digest is over the exact bytes
 * sent, so the caller hands over the raw text before parsing anything.
 *
 * **A timestamp more than five minutes from now is refused**, signature or not:
 * that is what keeps a captured request from being replayed later. The compare
 * is constant-time, and an unset signing secret refuses everything — an
 * environment with no Slack app answers no Slack request.
 */

/** How far a request's timestamp may be from now, either way. */
export const SLACK_SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

const SIGNATURE = /^v0=[0-9a-f]{64}$/;
const TIMESTAMP = /^\d{1,12}$/;

export function verifySlackSignature({
  rawBody,
  timestamp,
  signature,
  signingSecret = process.env.SLACK_SIGNING_SECRET,
  now = Date.now(),
}: {
  rawBody: string;
  /** `X-Slack-Request-Timestamp`: Unix seconds. */
  timestamp: string | null;
  /** `X-Slack-Signature`: `v0=` and 64 hex characters. */
  signature: string | null;
  signingSecret?: string;
  /** Milliseconds; injectable for tests. */
  now?: number;
}): boolean {
  if (!signingSecret) return false;
  if (timestamp === null || !TIMESTAMP.test(timestamp)) return false;
  if (signature === null || !SIGNATURE.test(signature)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > SLACK_SIGNATURE_MAX_AGE_SECONDS) {
    return false;
  }

  const expected = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
  // Both are `v0=` plus 64 hex characters by now, so the lengths match.
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
