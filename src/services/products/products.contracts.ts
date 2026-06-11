import { z } from "zod";

/** Response of the admin product create/update routes. */
export const productIdResponse = z.object({
  product_id: z.string(),
});
