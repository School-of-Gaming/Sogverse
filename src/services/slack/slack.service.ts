import { parseJsonResponse, readErrorMessage } from "@/lib/api/json-response";
import {
  sendTestSlackMessageResponse,
  type SendTestSlackMessageBody,
  type SendTestSlackMessageResponse,
} from "./slack.contracts";

/**
 * Posting to Slack from the admin testing page. The bot token lives on the
 * server, so the send goes through the admin route rather than the client.
 */
export class SlackService {
  async sendTestMessage(
    body: SendTestSlackMessageBody,
  ): Promise<SendTestSlackMessageResponse> {
    const response = await fetch("/api/admin/send-test-slack-message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, `HTTP ${response.status}`));
    }
    return parseJsonResponse(response, sendTestSlackMessageResponse);
  }
}
