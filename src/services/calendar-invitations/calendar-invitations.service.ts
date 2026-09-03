import type { AppSupabaseClient } from "@/types";
import { parseJsonResponse, readApiError } from "@/lib/api/json-response";
import {
  calendarInvitationResponse,
  type CalendarInvitationBody,
  type CalendarInvitationResponse,
} from "./calendar-invitations.contracts";

const INVITATIONS_URL = "/api/admin/calendar-invitations";

/**
 * The invitation tool's client side.
 *
 * One method, going through `fetch` rather than the injected client: composing
 * the mail needs the message catalogs and sending it needs the relay's
 * credentials, neither of which exists in a browser. The injected client is
 * therefore unused, and kept for symmetry with every other service in the tree.
 */
export class CalendarInvitationsService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Render an invitation, and send it unless this is a preview.
   *
   * The failure is raised as an `ApiError` rather than a plain `Error` because
   * the card branches on one status: a 503 means the SMTP relay has no
   * credentials yet, which is a setup step to describe rather than a failure to
   * report.
   */
  async send(
    body: CalendarInvitationBody,
  ): Promise<CalendarInvitationResponse> {
    const response = await fetch(INVITATIONS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw await readApiError(response, "Could not send the invitation");
    }
    return parseJsonResponse(response, calendarInvitationResponse);
  }
}
