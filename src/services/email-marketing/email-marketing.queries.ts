"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmailMarketingService } from "./email-marketing.service";

export const emailMarketingKeys = {
  all: ["email-marketing"] as const,
  mine: () => [...emailMarketingKeys.all, "mine"] as const,
};

/**
 * The signed-in parent's School of Gaming email marketing, read live from
 * Klaviyo: a third-party round trip, so its consumer shows a skeleton at once.
 *
 * **Read once per mount, never refetched behind the parent's back.** Klaviyo
 * applies a subscription change as a queued job, so a read a moment after a
 * write can still answer the old standing; a refetch on focus would then flip
 * the box back under them. No automatic retry either: a failed read shows its
 * own retry, and three silent attempts would hold the skeleton for seconds.
 */
export function useMyEmailMarketing({ enabled = true } = {}) {
  return useQuery({
    queryKey: emailMarketingKeys.mine(),
    queryFn: () => new EmailMarketingService().getMine(),
    enabled,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Subscribe or unsubscribe the signed-in parent.
 *
 * **On success the cache is set to the written answer rather than
 * invalidated**: Klaviyo queues the change, so an immediate re-read could
 * still return the standing the parent just changed away from.
 */
export function useSetMyEmailMarketing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subscribed: boolean) => new EmailMarketingService().setMine({ subscribed }),
    onSuccess: (standing) => {
      queryClient.setQueryData(emailMarketingKeys.mine(), standing);
    },
  });
}
