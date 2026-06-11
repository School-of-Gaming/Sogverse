import { z } from "zod";

/** Response of GET /api/auth/pin/status. */
export const pinStatusResponse = z.object({
  isSet: z.boolean(),
  unlocked: z.boolean(),
});

/** Response of POST /api/auth/pin/verify (a wrong PIN is a 200 with verified=false). */
export const pinVerifyResponse = z.object({
  verified: z.boolean().optional(),
});
