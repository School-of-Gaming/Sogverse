import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The stored form of a `/link` token: its SHA-256 as 64 lowercase hex
 * characters — the same digest `consume_discord_link_token` computes in SQL,
 * so the bot's insert, the page's read and the function's delete all name one
 * row.
 */
export function hashDiscordLinkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** What the confirm page can say about a token before anyone spends it. */
export type DiscordLinkTokenState =
  | { kind: "live"; discordUsername: string }
  | { kind: "expired" }
  | { kind: "used" };

/**
 * Look a raw token up, for the confirm page to name the Discord account it
 * would link. The page calls this only once the viewer is a Gedu or an admin.
 *
 * `discord_link_tokens` is granted to the service role alone, so the read needs
 * the service-role client. It only reads — it never deletes or spends the
 * token; that is `consume_discord_link_token`'s, behind the button's POST.
 * An unknown token and a used one are the same answer, as they are there.
 */
export async function readDiscordLinkToken(
  token: string,
): Promise<DiscordLinkTokenState> {
  const { data, error } = await createAdminClient()
    .from("discord_link_tokens")
    .select("discord_username, expires_at")
    .eq("token_hash", hashDiscordLinkToken(token))
    .maybeSingle();
  if (error) throw error;
  if (!data) return { kind: "used" };
  // The same boundary as the function's: expired at the instant itself.
  if (new Date(data.expires_at).getTime() <= Date.now()) return { kind: "expired" };
  return { kind: "live", discordUsername: data.discord_username };
}
