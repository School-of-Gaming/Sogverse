import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import type { AppSupabaseClient, DiscordLink } from "@/types";
import {
  sendTestDiscordMessageResponse,
  type SendTestDiscordMessageBody,
  type SendTestDiscordMessageResponse,
} from "./discord-link.contracts";

/** What a page shows of a link: the Discord account it points at. */
export type DiscordLinkSummary = Pick<DiscordLink, "discord_username">;

/** A linked account as the admin testing page lists it. */
export interface LinkedDiscordAccount {
  profileId: string;
  name: string;
  discordUsername: string;
}

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
      .select("discord_username")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Every linked account with its owner's name, for an admin (RLS gives anyone
   * else their own row alone). Small and indexed: only Gedus and admins link.
   */
  async listLinkedAccounts(): Promise<LinkedDiscordAccount[]> {
    const { data, error } = await this.supabase
      .from("discord_links")
      .select("profile_id, discord_username, profile:profiles(first_name, last_name)");
    if (error) throw error;
    return data
      .map((row) => ({
        profileId: row.profile_id,
        name: `${row.profile.first_name} ${row.profile.last_name}`.trim(),
        discordUsername: row.discord_username,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * The Discord user id a profile is linked to, or `null` when it has none.
   * Read on the server to address a DM, so the id never comes from a client.
   */
  async getDiscordUserId(profileId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("discord_links")
      .select("discord_user_id")
      .eq("profile_id", profileId)
      .maybeSingle();
    if (error) throw error;
    return data?.discord_user_id ?? null;
  }

  /**
   * DM a linked account from this environment's bot, through the admin-only
   * route that holds the bot token. A refusal throws with the route's message,
   * which carries Discord's own when Discord was the one refusing.
   */
  async sendTestMessage(
    body: SendTestDiscordMessageBody,
  ): Promise<SendTestDiscordMessageResponse> {
    const response = await fetch("/api/admin/send-test-discord-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `HTTP ${response.status}`));
    }
    return parseJsonResponse(response, sendTestDiscordMessageResponse);
  }
}
