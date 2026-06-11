import { z } from "zod";

/**
 * Response of POST /api/checkout/products/create — the three signup
 * outcomes: paid (redirect to Stripe Checkout), free (instantly active
 * participation), or product full.
 */
export const createParticipationResponse = z.discriminatedUnion("status", [
  z.object({ status: z.literal("redirect"), checkoutUrl: z.string() }),
  z.object({ status: z.literal("free_confirmed"), participationId: z.string() }),
  z.object({ status: z.literal("full") }),
]);

export type CreateParticipationResponse = z.infer<
  typeof createParticipationResponse
>;

/** Response of POST /api/participations/waitlist. */
export const joinWaitlistResponse = z.object({
  participationId: z.string(),
  waitlistPosition: z.number(),
  status: z.string(),
});

export type JoinWaitlistResponse = z.infer<typeof joinWaitlistResponse>;
