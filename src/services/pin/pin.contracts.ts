import { z } from "zod";

/**
 * The parent PIN as it travels on the wire: exactly four digits. Shared by the
 * set/change route and the verify route, so the two cannot drift apart.
 */
export const pinBody = z.object({
  pin: z.string().regex(/^\d{4}$/, "must be exactly four digits"),
});

/** Response of GET /api/auth/pin/status. */
export const pinStatusResponse = z.object({
  isSet: z.boolean(),
  unlocked: z.boolean(),
});

/** Response of POST /api/auth/pin/verify (a wrong PIN is a 200 with verified=false). */
export const pinVerifyResponse = z.object({
  verified: z.boolean().optional(),
});
