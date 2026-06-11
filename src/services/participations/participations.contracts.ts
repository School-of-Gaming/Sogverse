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

/** Request body of POST /api/participations/waitlist. */
export const joinWaitlistBody = z.object({
  productId: z.string().min(1, "productId and gamerId are required"),
  gamerId: z.string().min(1, "productId and gamerId are required"),
});

/** Response of POST /api/participations/waitlist. */
export const joinWaitlistResponse = z.object({
  participationId: z.string(),
  waitlistPosition: z.number(),
  status: z.string(),
});

export type JoinWaitlistResponse = z.infer<typeof joinWaitlistResponse>;

/**
 * `create_participation` RPC result (Json in codegen; structure from
 * supabase/schema.sql). The id/until fields stay optional here because the
 * route turns their absence into a controlled 500 per kind — the schema
 * checks structure, the route checks the per-kind invariants.
 */
export const createParticipationRpcResult = z.object({
  kind: z.enum(["free_active", "reserving", "full"]),
  participation_id: z.string().optional(),
  reserved_until: z.string().optional(),
});

/** `join_waitlist` RPC result (Json in codegen; structure from schema.sql). */
export const joinWaitlistRpcResult = z.object({
  participation_id: z.string(),
  waitlist_position: z.number(),
  status: z.string(),
});
