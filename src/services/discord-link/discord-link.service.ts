import type { AppSupabaseClient, DiscordLink } from "@/types";

/** What a page shows of a link: who it points at, and since when. */
export type DiscordLinkSummary = Pick<
  DiscordLink,
  "discord_username" | "linked_at"
>;

/**
 * Reading an admin's or a Gedu's linked Discord account.
 *
 * A plain select, because RLS already says who may see a row: its owner, and
 * any admin. Writing is the confirm route's job alone, through an RPC that
 * spends a token the bot minted.
 */
export class DiscordLinkService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * This profile's link, or `null` when it has none. A primary-key lookup of
   * at most one row. A failed read throws rather than answering `null`: "not
   * linked" is a statement about the account, and a network blip is not one.
   */
  async getLink(profileId: string): Promise<DiscordLinkSummary | null> {
    const { data, error } = await this.supabase
      .from("discord_links")
      .select("discord_username, linked_at")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}
