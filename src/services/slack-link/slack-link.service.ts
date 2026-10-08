import type { AppSupabaseClient, SlackLink } from "@/types";

/** What a page shows of a link: the Slack account it points at. */
export type SlackLinkSummary = Pick<SlackLink, "slack_username">;

/**
 * Reading an admin's linked Slack account.
 *
 * A plain select, because RLS already says who may see a row: its owner, and
 * any admin. Writing is the confirm route's job alone, through an RPC that
 * spends a token the Slack app minted.
 */
export class SlackLinkService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * This profile's link, or `null` when it has none. A primary-key lookup of
   * at most one row. A failed read throws rather than answering `null`: "not
   * linked" is a statement about the account, and a network blip is not one.
   */
  async getLink(profileId: string): Promise<SlackLinkSummary | null> {
    const { data, error } = await this.supabase
      .from("slack_links")
      .select("slack_username")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
}
