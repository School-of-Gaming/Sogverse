import type { AppSupabaseClient } from "@/types";

/**
 * Service-layer wrapper for the v2 voice room flow. The injected client is
 * not used directly — the only operation here is a POST to
 * `/api/voice/token`, which gates and mints server-side. Kept in the
 * standard service shape so React Query hooks have a single object to
 * construct.
 */
export class VoiceService {
  /** Service constructor signature matches sibling services for hook consistency, even though no method here reads the client. */
  constructor(_supabase: AppSupabaseClient) {}

  /**
   * Mint a Daily.co meeting token for a v2 product group
   * (`product_groups_v2.id`). The token endpoint derives the Daily room
   * name from the group + current session window and get-or-creates the
   * room on demand — no DB-side voice room table.
   */
  async getToken(
    groupId: string,
  ): Promise<{ token: string; roomUrl: string; role: string }> {
    const response = await fetch("/api/voice/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to get token");
    }

    return response.json();
  }
}
