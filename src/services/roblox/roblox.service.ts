import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import type { AppSupabaseClient, RobloxAccount } from "@/types";
import type { GameFigure } from "@/lib/constants/game-platforms";
import {
  robloxAvatarsResponse,
  robloxProfileResponse,
  type RobloxProfileResponse,
  type RobloxRenderUrls,
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
   * The renders for accounts we already hold the ids of.
   *
   * **Takes a list, always**, even where today's callers pass one: the upstream
   * cost is per *request*, not per id, so the batch is the only shape a roster
   * can afford and having a second single-id entry point would be an invitation
   * to write the N-request version by accident.
   *
   * `figures` is the other half of that cost — one upstream request each — so a
   * caller names the figures it will actually draw rather than taking all of
   * them and discarding the rest.
   */
  async resolveRenders(
    userIds: readonly number[],
    figures: readonly GameFigure[],
  ): Promise<Partial<Record<string, RobloxRenderUrls>>> {
    // `Partial` because a record lookup is not the guarantee a bare
    // `Record<string, T>` claims: every string would type as present. The route
    // does promise an entry per requested id, and saying so in the type here
    // would move that promise's enforcement to the caller, where nothing checks
    // it — so callers get an honest `| undefined` and handle the miss.
    if (userIds.length === 0) return {};

    const response = await fetch(
      `/api/roblox/avatars?userIds=${encodeURIComponent(userIds.join(","))}` +
        `&figures=${encodeURIComponent(figures.join(","))}`,
    );

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to resolve Roblox avatars"),
      );
    }

    const { renders } = await parseJsonResponse(
      response,
      robloxAvatarsResponse,
    );
    return renders;
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
