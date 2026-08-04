import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import type { AppSupabaseClient, RobloxAccount } from "@/types";
import {
  robloxProfileResponse,
  type RobloxProfileResponse,
} from "./roblox.contracts";

/**
 * The Roblox identity layer — the lookup, and the row it is saved into.
 *
 * The split follows the service-layer rule exactly: the reads go through the
 * injected client (`roblox_accounts` is RLS-scoped, so the database decides what
 * a caller may see), and every write goes through our own route. The route is
 * not a formality on this platform — both Roblox APIs refuse a browser outright,
 * and the route re-runs the lookup server-side so a saved account id is never
 * something the client asserted.
 */
export class RobloxService {
  constructor(private supabase: AppSupabaseClient) {}

  /** The caller's own linked account, or `null` when they have never given one. */
  async getMyRobloxAccount(): Promise<RobloxAccount | null> {
    const { data: claims } = await this.supabase.auth.getClaims();
    const userId = claims?.claims.sub;
    if (!userId) return null;

    return this.getRobloxAccount(userId);
  }

  /**
   * Somebody else's linked account — a parent reading their own child's.
   *
   * No authorization of its own, deliberately: RLS answers with nothing for a
   * row the caller may not see, so a wrong id comes back as `null` rather than
   * as a leak this method would have had to prevent by hand.
   */
  async getRobloxAccount(userId: string): Promise<RobloxAccount | null> {
    const { data, error } = await this.supabase
      .from("roblox_accounts")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  /**
   * Link (or, with `null`, unlink) the caller's own account.
   *
   * The route resolves the handle against Roblox before writing, so a successful
   * save lands *verified* and the response carries the canonical casing with the
   * numeric account id.
   */
  async updateMyRoblox(robloxUsername: string | null): Promise<void> {
    const response = await fetch("/api/roblox/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ robloxUsername }),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to update Roblox username"),
      );
    }
  }

  /**
   * Verify a username and resolve its avatar in one round trip. Throws with the
   * route's message when the account does not exist or the lookup fails.
   */
  async verifyRobloxUsername(username: string): Promise<RobloxProfileResponse> {
    const response = await fetch(
      `/api/roblox/verify?username=${encodeURIComponent(username)}`,
    );

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Roblox verification failed"),
      );
    }

    return parseJsonResponse(response, robloxProfileResponse);
  }
}
