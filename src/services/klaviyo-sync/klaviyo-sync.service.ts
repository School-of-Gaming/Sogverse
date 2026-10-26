import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import { klaviyoSyncObservation, type KlaviyoSyncObservation } from "./klaviyo-sync.contracts";

/**
 * The Klaviyo sync as the admin UI sees it: one observation. No Supabase
 * client — both halves of it are the service role's alone, so it is a route.
 */
export class KlaviyoSyncService {
  /**
   * Tell the server an admin is looking, so a due outbox row nothing kicked is
   * kicked, and learn how many rows are parked.
   */
  async observe(): Promise<KlaviyoSyncObservation> {
    const response = await fetch("/api/klaviyo-sync/observe", { method: "POST" });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to observe the Klaviyo sync"));
    }
    return parseJsonResponse(response, klaviyoSyncObservation);
  }
}
