import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The stored form of a Slack link token: its SHA-256 as 64 lowercase hex
 * characters — the same digest `consume_slack_link_token` computes in SQL, so
 * the Slack route's insert, the page's read and the function's delete all name
 * one row.
 */
export function hashSlackLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** What the confirm page can say about a token before anyone spends it. */
export type SlackLinkTokenState =
  | { kind: "live"; slackUsername: string }
  | { kind: "expired" }
  | { kind: "used" };

/**
 * Look a raw token up, for the confirm page to name the Slack account it would
 * link. The page calls this only once the viewer is an admin.
 *
 * `slack_link_tokens` is granted to the service role alone, so the read needs
 * the service-role client. It only reads — spending the token is
 * `consume_slack_link_token`'s, behind the button's POST. An unknown token and
 * a used one are the same answer, as they are there.
 */
export async function readSlackLinkToken(token: string): Promise<SlackLinkTokenState> {
  const { data, error } = await createAdminClient()
    .from("slack_link_tokens")
    .select("slack_username, expires_at")
    .eq("token_hash", hashSlackLinkToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) return { kind: "used" };
  // The same boundary as the function's: expired at the instant itself.
  if (new Date(data.expires_at).getTime() <= Date.now()) return { kind: "expired" };
  return { kind: "live", slackUsername: data.slack_username };
}
