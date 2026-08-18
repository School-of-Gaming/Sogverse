import type { AppSupabaseClient } from "@/types";
import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import {
  minecraftPasswordResetResponse,
  type MinecraftPasswordResetResult,
} from "./minecraft-education.contracts";

/**
 * Service-layer wrapper for the Minecraft Education admin tools.
 *
 * The injected client is unused, which is the standard shape for a service
 * whose only operation is a POST to an API route: the reset needs the Azure
 * client secret, so it can only happen server-side, and the route is where the
 * certified-gedu gate lives. The constructor still takes the client so the
 * React Query hooks construct this the same way they construct every other
 * service.
 */
export class MinecraftEducationService {
  /** Matches sibling services' constructor signature; no method reads it. */
  constructor(_supabase: AppSupabaseClient) {}

  /**
   * Reset the Minecraft Education password for each username, in order.
   *
   * The route answers 200 with a per-username result even when every one of
   * them failed — a failed *reset* is data the card renders in a row, not a
   * failed *request*. A non-OK status therefore means the call itself did not
   * happen (not signed in, not certified, too many usernames), and that is the
   * only case that throws.
   */
  async resetPasswords(
    usernames: readonly string[],
  ): Promise<MinecraftPasswordResetResult[]> {
    const response = await fetch("/api/tools/minecraft-password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames }),
    });

    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "Failed to reset passwords"),
      );
    }

    const { results } = await parseJsonResponse(
      response,
      minecraftPasswordResetResponse,
    );
    return results;
  }
}
