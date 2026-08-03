import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import {
  robloxProfileResponse,
  type RobloxProfileResponse,
} from "./roblox.contracts";

/**
 * The Roblox lookup layer.
 *
 * Unlike its Minecraft counterpart this service takes **no Supabase client**:
 * there is no `roblox_accounts` table yet, so it has no read methods and nothing
 * to inject. Everything it does goes through our own route, because both Roblox
 * APIs are server-side only — the browser cannot reach either directly.
 * A constructor argument lands here when persistence does.
 */
export class RobloxService {
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
