import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import { emailMarketingStanding, type EmailMarketingStanding } from "./email-marketing.contracts";

const ROUTE = "/api/parent/email-marketing";

/**
 * The signed-in parent's School of Gaming email marketing, read from and
 * written to Klaviyo live through the route. No Supabase client: Sogverse
 * stores none of it, and the Klaviyo key is the server's.
 */
export class EmailMarketingService {
  async getMine(): Promise<EmailMarketingStanding> {
    const response = await fetch(ROUTE);
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to read email marketing"));
    }
    return parseJsonResponse(response, emailMarketingStanding);
  }

  async setMine(standing: EmailMarketingStanding): Promise<EmailMarketingStanding> {
    const response = await fetch(ROUTE, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(standing),
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Failed to change email marketing"));
    }
    return parseJsonResponse(response, emailMarketingStanding);
  }
}
