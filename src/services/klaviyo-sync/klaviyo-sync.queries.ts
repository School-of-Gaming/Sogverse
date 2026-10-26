import { useQuery } from "@tanstack/react-query";
import { KlaviyoSyncService } from "./klaviyo-sync.service";

export const klaviyoSyncKeys = {
  all: ["klaviyo-sync"] as const,
  observation: () => [...klaviyoSyncKeys.all, "observation"] as const,
};

/**
 * Observe the Klaviyo sync once per mount of the page calling it: the server
 * kicks the sync when an outbox row is due with nothing to kick it, and answers
 * how many rows are parked. **This is the whole of the sync's clock** — nothing
 * runs on a schedule, so a stuck row waits for an admin to open the Users list.
 *
 * Mount only, never on focus or a retry: each call may queue a kick, and the
 * parked count is a quiet line nobody is waiting on.
 */
export function useKlaviyoSyncObservation() {
  return useQuery({
    queryKey: klaviyoSyncKeys.observation(),
    queryFn: () => new KlaviyoSyncService().observe(),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
