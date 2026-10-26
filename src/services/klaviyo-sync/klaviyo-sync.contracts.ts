import { z } from "zod";

/**
 * Response of POST /api/klaviyo-sync/observe: how many rows of each Klaviyo
 * outbox are parked — failed so many times in a row that they wait for their
 * parent to change again.
 */
export const klaviyoSyncObservation = z.object({
  parkedProfiles: z.number().int().nonnegative(),
  parkedEvents: z.number().int().nonnegative(),
});

export type KlaviyoSyncObservation = z.infer<typeof klaviyoSyncObservation>;
