import { z } from "zod";

/**
 * A parent's School of Gaming email marketing standing, as Klaviyo holds it:
 * both the response of GET and PUT /api/parent/email-marketing and the body of
 * the PUT. `subscribed` is true only when Klaviyo will actually send them
 * marketing — subscribed and not suppressed.
 */
export const emailMarketingStanding = z.object({
  subscribed: z.boolean(),
});

export type EmailMarketingStanding = z.infer<typeof emailMarketingStanding>;
